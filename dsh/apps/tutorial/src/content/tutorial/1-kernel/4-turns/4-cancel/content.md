---
type: lesson
title: 打断：工具要接住 signal
focus: /scanner.ts
terminal:
  open: true
  activePanel: 0
  panels: [['output', '输出'], ['terminal', '终端']]
---

# 打断：工具要接住 signal

用户随时可能按 Esc。这一课的 `scan` 工具要跑 300 毫秒，`main.ts` 在 100 毫秒时打断：

```ts
agent.cancel({ kind: 'user' })
```

`cancel()` 是 agent 接口上的方法，`kind` 记录是谁打断的：`user`、`parent`（父 agent）、`hook`、`disposed`。注意 `main.ts` 没有 `await harness.send()`，而是先拿到它的 promise，打断之后再等这一轮结束。

## 现在的情况

```text
  开始扫描 .
  用户打断
  扫描跑完了
[turn] [s] 轮次结束  aborted
打断之后又等了大约 200 毫秒
日志里的工具结果： Error: tool call aborted （错误）
```

轮次确实以 `aborted` 结束，但用户按下 Esc 之后，还要等扫描自己跑完，界面才回到空闲。扫描的结果也白算了：日志里记的是 `Error: tool call aborted`，不是“找到 120 个文件”。

## 动手

`execute` 的第二个参数是这次调用的上下文，其中 `exec.signal` 在打断时中止。在 TODO 处把它传给 `sleep`：

```ts
await sleep(300, exec.signal)
```

再运行：

```text
  开始扫描 .
  用户打断
[turn] [s] 轮次结束  aborted
打断之后又等了大约 0 毫秒
日志里的工具结果： Error: 扫描被中止 （错误）
```

“扫描跑完了”没有出现：工具在打断的那一刻就停了。

## 打断是协作式的

JavaScript 没法从外面强行停止一个正在运行的异步函数。agent loop 能做的是中止 signal，然后等已经开始的工具自己结束：上游调度器的注释说，中止会停止派发新的调用，并“drains started calls”。工具不看 signal，就只能等它跑完。

跑完之后，工具运行时发现 signal 已经中止，就把成功的结果换成规范的中止结果（[节选自上游 dsh-tools](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/tools/src/index.ts#L1965-L1977)），所以起始代码里看到的是 `Error: tool call aborted`。接住了 signal 的工具自己抛错，记下的就是它自己的错误。

无论哪种，日志里那次调用都有一个结果。还没开始的调用，调度器会补上合成的错误结果。这和上一章崩溃恢复补齐半截轮次是同一个要求：每个 `tool/call` 都必须配一个 `tool/result`，否则下一次请求里模型会看到一个没有结果的调用。

上一章的检查点策略也接了 signal：如果打断正好发生在工具执行前等待落盘的时候，它返回 `tool call aborted before dispatch`，根本不进入工具本体。

## 打断之外

agent 接口上还有几种在轮次进行中送入输入的方法（[上游 dsh-agent](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/agent/src/runtime-types.ts#L176-L242)）：

| 方法 | 作用 |
|---|---|
| `followup(message)` | 排一个新的轮次，`harness.send()` 用的就是它 |
| `steer(message)` | 插话：正在运行时，在下一个步骤开始时被领取，模型在下一次请求里看到它 |
| `inject(message)` | 给模型的上下文，不唤醒 agent，下一个步骤开始时一起带上；审批策略切换时的通知就是这样送进去的 |
| `cancel(cause)` | 打断当前的轮次，默认还清空排队的输入 |

试试把 `main.ts` 里的 `agent.cancel(...)` 换成插话：

```ts
import { createUserMessage } from '@deepseek-ai/dsh-llm'

agent.steer(createUserMessage({ content: [{ type: 'text', text: '只扫 src 目录' }], source: { kind: 'user' } }))
```

扫描照常跑完，日志里的工具结果是“找到 120 个文件”；请求 #2 的最后一条消息是“只扫 src 目录”，脚本里为它准备了回答“好，下次只扫 src”，轮次以 `completed` 结束。
