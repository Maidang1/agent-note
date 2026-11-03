---
type: lesson
title: 一步里的多个工具调用
focus: /files.ts
terminal:
  open: true
  activePanel: 0
  panels: [['output', '输出'], ['terminal', '终端']]
---

# 一步里的多个工具调用

模型可以在一次响应里请求好几个工具调用。这一课的脚本模型一次要读三个文件（规则写成 `{ kind: 'tool-calls', calls: [...] }`）。`files.ts` 里的 `read_file` 读 `a.ts` 要 300 毫秒，读另外两个各 100 毫秒。

## 现在的情况

```text
[response] #1  调用 read_file({"path":"a.ts"})
[response] #1  调用 read_file({"path":"b.ts"})
[response] #1  调用 read_file({"path":"c.ts"})
  开始读 a.ts
  读完 a.ts
  开始读 b.ts
  读完 b.ts
  开始读 c.ts
  读完 c.ts
...
这一轮用了大约 500 毫秒
```

三次读取一个接一个，总时间是三者之和。

## 动手

`read_file` 只读，不改任何状态。在 TODO 处声明它可以并行：

```ts
isConcurrencySafe: () => true,
```

再运行：

```text
  开始读 a.ts
  开始读 b.ts
  开始读 c.ts
  读完 b.ts
  读完 c.ts
  读完 a.ts
[request] #2  tools: read_file
    messages
    │ user: 读一下 a.ts、b.ts、c.ts
    │ assistant: (无文本)
    │ tool: a.ts 的内容
    │ tool: b.ts 的内容
    │ tool: c.ts 的内容
...
这一轮用了大约 300 毫秒
```

三次读取同时开始，总时间取决于最慢的那个。`a.ts` 最后读完，但请求 #2 里它的结果仍然排在第一个。

## 默认串行，声明了才并行

agent loop 不知道一个工具会不会改东西，所以默认按最保守的方式处理。`isConcurrencySafe` 是工具自己给的一个同步判断（[上游 dsh-tools](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/tools/src/index.ts#L268-L281)）：

- 只有返回 `true` 才能和同一批的其他调用并行；
- 不写、抛错、返回别的值，都算“独占”（exclusive）；
- 它拿得到参数，可以按参数决定，比如 `git` 工具的 `status` 可以并行，`commit` 不行；
- 模型看不到它，它不进入工具的 schema。

独占的调用单独执行，还是一道顺序屏障：它前面的调用都结束了它才开始，它结束了后面的才开始。可以并行的调用组成一个池子同时跑，上限是 agent-loop 的配置 `maxParallelToolCalls`，默认 10。

## 并行的只有工具本体

回放这一轮（切到“完整步骤”）：三次 `tools/pre-execute` 和 `tools/execute` 先依次出现，之后才是三组 `tools/post-execute`、`tools/result`、`session/event · tool/result`。上游调度器的注释（[dsh-agent-loop](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/agent-loop/src/tool-calls.ts#L1-L11)）说明了顺序：

> Dispatch may overlap, while policy, results, and result context remain model-ordered.

- `tools/pre-execute` 按模型给出的顺序逐个运行，所以审批这类策略看到的还是有序的调用。
- 只有工具本体（`tools/execute`）重叠运行。
- 结果按模型的顺序提交：`a.ts` 没读完之前，`b.ts`、`c.ts` 的结果先放着，不写进日志。

所以会话日志、模型看到的消息，和串行执行时一模一样，并行只是让墙上时间变短。这也是“模型可见即已记录”能继续成立的原因：重放日志时，不需要知道当时哪个工具先跑完。
