---
type: lesson
title: 上下文快满了：用摘要换掉旧对话
focus: /main.ts
terminal:
  open: true
  activePanel: 0
  panels: [['output', '输出'], ['terminal', '终端']]
---

# 上下文快满了：用摘要换掉旧对话

会话日志只追加，对话越长，每次请求带的历史越多。模型的上下文窗口是有限的，总有装不下的时候。

这一课的脚本模型只有 1500 token 的窗口（脚本上写 `contextWindow: 1500`，适配器把它报告给上游）。用户一段接一段地贴日志，每段大约 300 token。终端里的长消息截到了 40 个字（`show.truncate`）。

## 现在的情况

```text
  上下文约 1306 tokens（窗口 1500）
[user] [s] 第 5 段日志：ERROR db.query timeout after 30s…
[request] #5  tools: (无)
[error] [s] 轮次以错误结束  请求超出了 1500 token 的上下文窗口
```

第 5 段放不下了，提供方报错，错误码是 `CONTEXT_WINDOW_EXCEEDED`（“能力 seam”一课提过，上下文溢出只有这一个规范错误码）。“上下文约 … tokens”是 `token-meter` 的 `measure()` 估算出来的，就是上一课 `contextPressure` 背后的同一套测量。

## 动手

在 TODO 处挂上压缩插件：

```ts
await harness.plugin(Compaction, { headroomTokens: 0, maxTokens: 500, retainTokens: 300 })
```

再运行：

```text
  上下文约 1306 tokens（窗口 1500）
[user] [s] 第 5 段日志：ERROR db.query timeout after 30s…
[request] #5  tools: (无)
    最后一条消息（user）
    │ You are now acting as a compaction engin…
[response] #5  ## Primary Request and Intent
- 用户在排查 db.query 超时，贴了 4 段日志
[request] #6  tools: (无)
    最后一条消息（user）
    │ 第 5 段日志：ERROR db.query timeout after 30s…
[response] #6  收到
[turn] [s] 轮次结束  completed
  上下文约 773 tokens（窗口 1500）
压缩：6 条事件被摘要替换，约 975 tokens
```

第 5 轮里有两次请求。请求 #5 是压缩插件发的：它带上全部旧对话，最后加一段指令，请模型写一份结构化的摘要。请求 #6 才是这一轮真正的请求。回放第 5 轮，`agent/pre-step` 指向 `compaction-basic`，压缩就发生在这一步里。

## 什么时候压缩

`compaction-basic` 挂在 `agent/pre-step` 上，每一步开始前测一次上下文压力。触发阈值是（[上游 README](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/compaction/compaction-basic/README.zh.md)）：

```text
floor(min(W × thresholdRatio, W − O − headroomTokens))
```

`W` 是窗口，`O` 是这次请求的输出上限。这一课是 `min(1500 × 0.8, 1500 − 500 − 0) = 1000`。第 4 轮开始前压力是 981，没到；第 5 轮开始前是 1306，超了。新的用户消息这时还没写进日志，所以测的是历史部分。

默认的 `headroomTokens` 是 65536，为大窗口模型准备，放在 1500 的小窗口上，`W − O − headroomTokens` 是负数，模型第一次使用时压缩就会报错。所以小窗口要显式设置余量；余量为 0 时，还要给摘要设一个正数的输出上限 `maxTokens`。

## 压缩之后模型看到什么

把 `show` 改成 `{ messages: true, truncate: 60 }` 再运行，请求 #6 的消息是：

```text
    │ user: This is an automatically generated checkpoint condensing an …
    │ user: 第 4 段日志：ERROR db.query timeout after 30s; ERROR db.query tim…
    │ assistant: 收到
    │ user: 第 5 段日志：ERROR db.query timeout after 30s; ERROR db.query tim…
```

第 1 到 3 段连同它们的回答被换成了一条摘要消息，开头的说明告诉模型：这是自动生成的检查点，把它当作背景，直接接着做（[上游 summarizer](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/compaction/compaction-basic/src/summarizer.ts#L69-L70)）。第 4 段和它的回答原样保留：`retainTokens: 300` 是保留近期对话的预算。

## 日志一条也没删

“替换”只发生在模型看到的那一层。会话日志多了三条事件：`compaction/start`、`compaction/summary`、`compaction/end`。`compaction/summary` 记着摘要文本和被替换的范围（`shadowedSeqs`，这一课是 6 条）。原来的消息还在日志里，只是被“遮住”（shadowed），不再进入请求。“模型可见即已记录”依然成立：摘要和被遮住的范围本身也是日志事件，恢复会话后得到同样的视图。

切分点也有讲究：工具调用和它的结果不能被拆开，否则模型会看到一个没有结果的调用。上游 `dsh-compaction` 的 [`tool-pairing.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/compaction/compaction/src/tool-pairing.ts) 只在调用和结果配平的位置下刀。

## 两条路

压缩插件还挂在 `agent/request-error` 上（[上游 compaction-basic](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/compaction/compaction-basic/src/index.ts#L190-L233)）：如果提前压缩没赶上，提供方真的报了 `CONTEXT_WINDOW_EXCEEDED`，它压缩一次再返回 `{ kind: 'retry' }`。这和上一章的 `llm-retry` 是同一个决策点，两个插件各管各的错误码：`llm-retry` 不重试 `CONTEXT_WINDOW_EXCEEDED`，压缩插件只管它。
