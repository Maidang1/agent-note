---
type: lesson
title: agent loop 也是插件
focus: /main.ts
---

# agent loop 也是插件

前两课画出了 L1 和 L2。这一课挂上最底下的 L4：`dsh-agent-loop`，也就是驱动一轮对话的循环。它和别的插件没有区别，只是依赖最多。

## 现在的情况

切到“依赖”视图。`agent-loop` 在 L4，有六条虚线连到上面的服务。上游的声明是（节选自 [`packages/core/agent-loop/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/agent-loop/src/index.ts#L341-L342)）：

```ts
export class AgentLoop extends Service implements AgentFactory {
  static inject = ['agents', 'sessions', 'llm', 'tools', 'systemPrompt', 'sessionProjections']
```

六个服务都在，所以它激活了。`main.ts` 接着发出一条“你好”，打开终端可以看到：

```text
[request] #1  tools: (无)
    system
    │ 你是一个助手
    最后一条消息（user）
    │ 你好
[error] [s] 轮次以错误结束  no adapter registered for provider "scripted"
```

请求组装好了，也发出去了，但没人接。切回“数据流”视图：`请求 #1` 从 `agent-loop` 指向 `llm`，紧接着的 `响应 #1` 是一个错误。`llm` 服务只是一个分发点：它按请求里的 provider 找注册在这条路由上的适配器。`scripted` 路由上还没有适配器。

## 挂上模型适配器

把 TODO 换成：

```ts
await harness.plugin(scriptedModel, { script })
```

`scriptedModel` 是本项目写的确定性模型适配器。它是一个上游 `LlmAdapter`，注册在 `ctx.llm` 的 `scripted` 路由上，按 `script` 里的规则作答，所以课程不需要 API key，每次运行结果都相同。真实模型（例如 `dsh-llm-deepseek`）用的是同一个接口，第 7 章会自己写一个。

保存后，流程图 L2 多了 `llm-scripted`。“注册”视图里，它有一条 `registerAdapter()` 指向 `llm`。终端里这一轮正常结束：

```text
[response] #1  你好！有什么可以帮你？
[turn] [s] 轮次结束  completed
```

## 回放这一轮

切到“数据流”视图，点“回放”，一步一步看这一轮。右上角的“步骤”打开完整的步骤列表；当前步骤是请求时，列表里会展开请求的 system 文本和工具。

先点一下“完整步骤”。简明模式把连续的日志事件合成一步“写入会话日志 ×N”，这一部分要看清每一条，所以从这里开始都按完整步骤讲；这个选择会被记住，想回到简明模式再点一次。你会看到这样的顺序：

```text
用户输入「你好」 → session/event · turn/start → … → session/event · system/message
→ session/event · user/message → session/event · request/header → session/event · request/context
→ 请求 #1 → 响应 #1 → session/event · assistant/message → … → session/event · turn/end
```

`session/event` 是写进会话日志的持久事实，从 `session` 发给监听它的 `session-projection` 和这个 agent 的作用域 `agent s`。注意顺序：系统提示词和用户消息先以 `system/message`、`user/message` 写进日志，然后才发出请求。这就是 dsh 的第一条不变式“模型可见即已记录”，第 5 章会专门讲。

到这里，L1、L2、L4 都有了，这已经是一个能对话的内核。上游 `sdk-minimal` 组合包挂的正是这七个内核插件。下一课在空着的 L3 挂一个你自己写的插件。
