---
type: lesson
title: 把一件事委派给子 agent
focus: /main.ts
terminal:
  open: true
  activePanel: 0
  panels: [['output', '输出'], ['terminal', '终端']]
---

# 把一件事委派给子 agent

审查一个 PR，可以拆成几件互不相干的小事：找 bug、查风格、看测试。每件事交给一个子 agent，它从零开始，只看到分给它的任务；父 agent 拿到结论，不必把每件事的中间过程都塞进自己的上下文。

这一课要搭起委派需要的几个插件：

- `dsh-subagent`：子 agent 运行时，管准入、取消和完成通知，提供 `ctx.subagents`。
- `dsh-subagent-spawn-in-process`：一个后端，在同一个进程里起一个全新的子 agent。
- `dsh-tool-subagent`：给模型的 `subagent` 工具，把委派交给指定名字的后端。

终端里的长消息截到了 70 个字（`show.truncate`）。

## 现在的情况

```text
[user] [s] 审查 PR #42
[request] #1  tools: (无)
[response] #1  没有可以委派的工具，我自己从头看
```

`tool-subagent` 已经挂上，`tools` 却是空的。它的配置是 `{ provider: 'spawn' }`，意思是“委派给名为 spawn 的后端”。运行时 `dsh-subagent` 自己不会起子 agent，只维护一张后端注册表；在名为 spawn 的后端注册之前，工具不登记，模型看不到它（节选自[上游 tool-subagent](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/tool-subagent/src/index.ts#L352-L367)）：

```ts
runtimeCtx.on('subagent/provider-added', (subagentProvider) => {
  if (subagentProvider.name === config.provider && mounted === undefined) mount(subagentProvider)
})
// ...
const present = runtimeCtx.subagents.getProvider(config.provider)
if (present !== undefined) {
  mount(present)
}
```

后端是可以替换的：上游还有经 ACP、Codex、Claude Code 运行子 agent 的后端，模型那一侧都是同一个 `subagent` 工具。

## 动手

在 TODO 处挂上进程内后端：

```ts
await harness.plugin(SpawnInProcess)
```

再运行（省略了 system 部分）：

```text
[user] [s] 审查 PR #42
[request] #1  tools: subagent
[response] #1  调用 subagent({"description":"找 bug","prompt":"找出 PR #42 里的 bug"})
[request] #2  tools: subagent
    messages
    │ user: 找出 PR #42 里的 bug
[response] #2  发现 1 个 bug：parseConfig 没有处理空文件
[turn] [4205620c] 轮次结束  completed
[request] #3  tools: subagent
    │ tool: started subagent 4205620c-94dd-46cb-89ca-68b51825e0af
[response] #3  已经派子 agent 去找 bug 了
[turn] [s] 轮次结束  completed
[request] #4  tools: subagent
    │ user: Background subagent 4205620c-94dd-46cb-89ca-68b51825e0af finished and …
[response] #4  子 agent 找到 1 个 bug，评审意见：parseConfig 要处理空文件
[turn] [s] 轮次结束  completed
父会话的轮次： 2
```

子 agent 的会话 id 是一个随机的 UUID，每次运行都不一样；终端和流程图里只显示前 8 位。

## 子 agent 从零开始

请求 #2 是子 agent 发的。它的消息里只有 `prompt` 那一句，看不到父 agent 的对话。这是 spawn 后端的约定（节选自[上游 spawn 后端](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/subagent-spawn-in-process/src/index.ts#L45-L46)）：

```ts
// Context contract: a spawned child starts fresh — it never sees the parent conversation.
readonly inheritsParentContext = false
```

所以 `prompt` 要把任务说完整。需要带上父级历史时，上游另有一个 `subagent-fork-in-process` 后端。

在流程图里点开请求 #2，最后一条运行时上下文消息多了两段话：

- 委派深度：当前 1，最多 1，不要再调用 `subagent`。默认的最大深度是 1（[上游 subagent 配置](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/subagent/src/index.ts#L195-L198)），子 agent 不能再往下派。
- 权限范围在启动时就定了，需要审批的操作一律自动拒绝（[上游 child-agent](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/subagent/src/child-agent.ts#L171-L175)）。子 agent 没有人可以问，这和上一章 `never` 策略的道理一样。

## 工具不等子 agent 做完

`subagent` 工具起了子 agent 就返回，结果只有一句 `started subagent <id>`。父 agent 拿着这句话继续，请求 #3 回了一句“已经派子 agent 去找 bug 了”，第一轮就结束了。

子 agent 做完后，运行时把它的结束语包成一条用户消息，发给父 agent（节选自[上游 manager](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/subagent/src/manager.ts#L1189-L1199)）：

```ts
const message = createSettlementMessage(
  activation.childId, terminal, activationAgent(activation) !== undefined,
)
// ...
this.sendWaking(parent, message, parent.status === 'idle' ? 'queue' : 'steer')
```

父 agent 空闲，消息就排进队列，唤醒一个新的轮次；父 agent 还在跑，消息就插进当前轮次。消息的格式在 [`continuation-messages.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/subagent/src/continuation-messages.ts#L138-L168) 里：先说子 agent 怎么结束的，再接 `Its closing message:` 和它的最后一段回答。来源标记是 `subagent-settled`，日志里能分清这是运行时的通知，不是用户说的话。

这一课是第一种情况：通知到的时候，父 agent 的第一轮已经结束，于是有了第二轮。流程图的轮次列表里，第二轮的输入是“agent s 被唤醒”。

`harness.send()` 只等到第一轮结束。这一课用 `harness.until()` 一直等到父会话有两条 `turn/end`；不等的话，`dispose()` 会在子 agent 做完之前把一切关掉。

## 为什么要挂这么多插件

- 会话持久化：这一课的子 agent 是“可继续的”，之后还能给它发消息，所以它的会话要落盘。没有持久化后端，委派会失败（[上游 manager](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/subagent/src/manager.ts#L1459-L1468)）。
- 工作目录：子 agent 运行时依赖 `workingDirectory`（[上游 subagent](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/subagent/src/index.ts#L199)），子 agent 在父 agent 的工作目录里干活。工作目录服务又依赖文件系统服务 `fs`（[上游 working-directory](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/session/working-directory/src/index.ts#L63)），这里用的是本地文件系统 `fs-local`。

## 看流程图

结构图里多了 `agent 4205620c` 这样的节点，就是子 agent。它和父 agent 的 `agent s` 并列，各有各的会话；回放第一轮，子 agent 的 `session/event` 都流向它自己的节点。
