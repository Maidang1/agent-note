---
type: lesson
title: 压力来了，先裁旧结果
focus: /main.ts
terminal:
  open: true
  activePanel: 0
  panels: [['output', '输出'], ['terminal', '终端']]
---

# 压力来了，先裁旧结果

上一章的压缩插件在上下文快满时请模型写摘要。摘要要多调用一次模型，还会把旧对话整段换掉。如果占地方的主要是工具结果，有一个更便宜的办法：只把旧结果剪短。

`dsh-compaction-tool-result-pruner` 就做这件事。它不调用模型，只把过长的工具结果换成“开头 + 标记 + 结尾”。

这一课还是 1500 token 的小窗口。用户让模型一段一段地看日志，每段 30 行，大约 900 个字符。

## 现在的情况

```text
  上下文约 858 tokens（窗口 1500）
[response] #7  调用 read_log({"part":4})
[response] #8  ## Primary Request and Intent
- 用户在逐段查看服务日志
[response] #9  这段没有异常
  上下文约 690 tokens（窗口 1500）
...
摘要： 1 次
裁剪： 0 条工具结果
```

触发阈值和上一章一样是 1000。第 4 段读回来以后，下一步开始前压力超过阈值，压缩插件发出请求 #8 写摘要。

## 动手

在 TODO 处挂上裁剪器：

```ts
await harness.plugin(ToolResultPruner, { thresholdChars: 300, headChars: 120, tailChars: 80 })
```

再运行：

```text
[response] #7  调用 read_log({"part":4})
[response] #8  这段没有异常
  上下文约 449 tokens（窗口 1500）
...
摘要： 0 次
裁剪： 4 条工具结果
日志里的 tool/result： 9 条
第 4 段裁剪后：
[4-0] INFO request ok in 20ms
[4-1] INFO request ok in 21ms
[4-2] INFO request ok in 22ms
[4-3] INFO request ok in 23ms


[... tool result middle pruned ...]

request ok in 26ms
[4-28] INFO request ok in 20ms
[4-29] INFO request ok in 21ms
```

摘要请求没有了。同一时刻，4 条工具结果都被剪成了开头 120 个、结尾 80 个字符，压力降到 1000 以下，压缩到此为止。

## 先裁，再量，不够才摘要

裁剪器不自己找时机，它是一个服务（`ctx.toolResultPruner`），由压缩插件在压力达标之后调用（节选自[上游 compaction-basic](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/compaction/compaction-basic/src/index.ts#L321-L327)）：

```ts
// Once pressure qualifies, land the model-free pass before choosing a
// summary range, then remeasure through the singleton replay fold.
if (prune !== undefined) {
  prune.pruneSession(agent.session)
  measurement = meter.measure(agent.session)
}
if (measurement.totalTokens < spec.thresholdTokens) return null
```

压缩插件用 `ctx.get('toolResultPruner')` 取这个服务（[同一文件 L292](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/compaction/compaction-basic/src/index.ts#L292)），取不到就跳过裁剪，所以裁剪器是可选的，挂载顺序也无所谓。这是一次直接的方法调用，不经过事件，所以流程图上 `compaction-basic` 和 `tool-result-pruner` 之间没有数据流箭头。

阈值以下什么都不裁：第 1 到 3 轮，上下文 858 tokens 时，工具结果都是原样。

## 原始结果还在日志里

日志里的 `tool/result` 有 9 条：5 条原始结果，加上 4 条替换。每裁一条，裁剪器追加两条事件（[上游 pruner](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/compaction/compaction-tool-result-pruner/src/index.ts#L160-L171)）：

1. `compaction/prune`：记下被遮住的是哪条事件，以及它大约占多少 token。
2. 一条新的 `tool/result`：内容是裁剪后的文本，带着 `surfaceOp: { op: 'replace', ... }`，在模型看到的视图里替换原来那条。

这和上一章的摘要是同一个机制：日志只追加，旧事件被“遮住”，不再进入请求。恢复会话后，视图还是一样。

## 和 spill 有什么不同

| | spill | 裁剪 |
|---|---|---|
| 什么时候 | 工具一返回就裁 | 上下文压力达标才裁 |
| 完整内容在哪 | spill 文件 | 会话日志里的原始事件 |
| 模型能不能找回 | 能，提示里有路径 | 不能，模型只看到一个标记 |
| 日志里存的 | 裁剪后的版本 | 原始版本和替换版本都有 |

两者可以一起用：spill 管住单条结果的大小，裁剪器在压力大时再把旧结果收紧一次。默认配置下，超过 8192 个字符的结果才会被裁，保留开头 4096 个和结尾 1024 个字符（[上游 README](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/compaction/compaction-tool-result-pruner/README.zh.md)）。这一课把阈值调得很小，是为了用小窗口演示。
