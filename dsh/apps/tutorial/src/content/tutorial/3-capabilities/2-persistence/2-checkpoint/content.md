---
type: lesson
title: 先落盘再动手
focus: /first-run.ts
---

# 先落盘再动手

上一课的第一次运行正常结束了。这一课它死在半路上：`review.ts` 里的 `post_review` 先把评审发到 PR，然后调用 `process.exit(1)`，模拟进程在副作用发生之后、结果写回之前被杀掉。

## 现在的情况

`first-run.ts` 已经挂了 JSONL 后端，可是重启之后：

```text
--- 第一次运行 ---
[user] [s] 给 PR #42 发布评审
[response] #1  调用 post_review({"pr":42,"body":"可以合并"})
  评审已经发到 PR #42
进程退出，退出码 1
--- 重启 ---
磁盘上的会话： []
[user] [s] 继续
[response] #1  继续什么？我们还没开始
```

磁盘上什么都没有。后端把实时事件先放进一个批处理窗口，攒一批再写；进程在窗口写出之前死了，整轮对话连同“调用过 `post_review`”这件事一起丢了。

这是最坏的情况：外部世界已经变了（评审发出去了），日志里却没有任何记录。模型重启后什么也不知道；用户如果再说一次“发布评审”，它没有理由不再发一次。

## 动手

在 `first-run.ts` 的 TODO 处挂上检查点策略：

```ts
await harness.plugin(CheckpointPolicy)
```

再看重启之后：

```text
磁盘上的会话： [ 's' ]
恢复出的事件： … assistant/message tool/call tool/result step/end turn/end session/end-seed
[user] [s] 继续
[request] #1  tools: post_review
    messages
    │ user: 给 PR #42 发布评审
    │ assistant: (无文本)
    │ tool: The tool call was interrupted after it was recorded, but no result was durably recorded. Its outcome is unknown. …
    │ user: 继续
[response] #1  上次发布的结果未知，我先去 PR #42 看看评审有没有发出去
```

## 检查点策略做了什么

整个插件只有三个监听器（[节选自上游 dsh-session-checkpoint-policy](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/session/session-checkpoint-policy/src/index.ts#L63-L83)）：

```ts
ctx.on('llm/stream', …)        // 请求模型之前：flush
ctx.on('tools/execute', async (exec, next) => {
  if (exec.agent === undefined || exec.parent !== undefined) return next()
  await ctx.sessions.flush(exec.agent.session)
  if (exec.signal.aborted) return abortedBeforeDispatchResult()
  return next()
})
ctx.on('agent/pre-step', …)    // 下一步开始之前：flush
```

`tools/execute` 是包住工具本体的 waterfall（“工具流水线”一课）。检查点策略在调用 `next()` 之前等 `flush` 完成，所以 `tool/call` 一定在工具本体运行之前就在磁盘上了。崩溃发生在之后，日志至少记得“调用过”。

持久化和检查点是两个插件。上游 README 的说法是：后端存储事件日志，策略决定什么时候必须刷到存储。不带策略也能用，只是更弱，批处理窗口里的写入可能丢失。

## 补上半截的轮次

磁盘上的日志停在 `tool/call`，后面的事件是恢复时补的。agent loop 读出日志后，调用 `interruptedTurnClosers()` 生成补齐用的事件，再用同一个写句柄追加（[节选自上游 dsh-agent-loop](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/agent-loop/src/index.ts#L884-L892)）：

- 每个没有结果的工具调用，补一条错误的 `tool/result`；
- 没结束的步骤，补 `step/end`；
- 最后补一条 `turn/end`，原因是 `interrupted`。

补上的工具结果分两种措辞（[节选自上游 dsh-session](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/session/src/repair.ts#L32-L41)）：调用已经记录了，结果未知，“只读或幂等的操作才重试，有副作用的先核实外部状态或问用户”；调用还没记录，那就是“需要的话重试”。模型看到的是前一种。这一课的脚本模型按这个提示作答：先去 PR 上看看，而不是再发一次。

为什么由 agent 层补，而不是持久化后端？后端只保证“物理上有效”：没有写坏的尾巴。一轮对话怎样才算完整、缺的部分该怎么告诉模型，是 agent 的语义，所以修复放在 agent loop 里。
