---
type: lesson
title: pre-step：接纳还是拒绝
focus: /secret-filter.ts
---

# pre-step：接纳还是拒绝

每个步骤开始前，驱动器都要经过 `preStep()`：先从 inbox 领取消息，再组装提示词，最后把领取到的消息交给 `agent/pre-step` waterfall 做决策。

```ts
const decision = await this.dispatch.waterfall(
  'agent/pre-step', { messages: claimed, ...position, signal },
  (): Promise<PreStepDecision> => {
    // 默认决策：enter，消息是领取到的消息加上运行时上下文快照
  },
)
```

（节选自上游 agent-loop。）默认决策在最内层，是 `enter`。监听器可以改写消息、追加消息，或者返回 `{ kind: 'reject' }`。

## 现在的情况

`secret-filter.ts` 在 `agent/pre-step` 上挂了一个监听器，它打印领取到的消息，然后调用 `next()` 委托给默认决策。所以两条消息都进了模型请求，会话日志里有 2 条 `user/message`。

流程图上，`secret-filter` 带着“课程”标签在 L3。“依赖”视图里它有一条虚线指向 `agent`；“注册”视图里有一条 `on agent/pre-step` 指向 `agent-loop`，因为这个事件由 agent loop 发出。回放第一轮，`agent/pre-step` 那一步从 `agent-loop` 指向 `secret-filter`，后面照常是 `请求 #1`。

## 动手

消息里出现“密码”时，不调用 `next()`，直接拒绝：

```ts
if (texts.some(text => text.includes('密码'))) return { kind: 'reject' }
```

再看第一条消息的输出：

```text
[event] turn/start
  pre-step 轮次 1 步骤 1： [ '我的密码是 123456' ]
[event] turn/end
[turn] [s] 轮次结束  blocked
```

回放第一轮，`agent/pre-step` 之后直接是 `session/event · turn/end`，没有请求，`llm` 一次也没有亮起来。轮次照样打开和关闭，只是以 `blocked` 结束，没有 `step/start`，也没有花一次模型调用。最后一行变成“会话日志里有 1 条 user/message”：被拒绝的消息从未写进日志。

“模型可见即已记录”反过来也成立：没有进入请求的输入，不会在日志里留下“模型看到过”的记录。上游 agent-loop 在 `agent/request` 和 `ctx.llm.prepareCall()` 两个异步阶段也遵守同样的顺序：任何一处取消，都不会提交系统提示词或用户消息。

## 扩展点都在决策点上

回头看 agent-loop 的结构，扩展点都放在决策点上：

| 事件 | 模式 | 决定什么 |
|---|---|---|
| `agent/pre-step` | waterfall | 这一步接纳哪些输入，或拒绝这一步 |
| `agent/request` | waterfall | 用哪个模型、什么参数 |
| `agent/request-error` | waterfall | 请求失败后是否重试 |
| `agent/turn-stopping` | serial | 轮次是否真的结束 |

插件不需要修改循环就能改变这些决策。上游的压缩插件 `dsh-compaction-basic` 就挂在 `agent/pre-step` 上，在派生请求之前检查上下文压力。

注意 `secret-filter` 注入的是 `agents`，不是 `agentLoop`。扩展插件依赖 `agent` 包声明的接口和事件，从不直接依赖 `agent-loop` 的实现。换一个实现同一接口的驱动器，这个插件不用改。
