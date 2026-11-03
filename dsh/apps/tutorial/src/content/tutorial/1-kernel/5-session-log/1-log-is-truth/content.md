---
type: lesson
title: 模型可见即已记录
focus: /main.ts
---

# 模型可见即已记录

dsh 仓库约定里有一条规则被反复引用：

> **Model-visible ⟺ logged**：任何进入模型请求的内容，都必须能从会话日志重建；新增一种模型可见的输入，就要新增一种会话事件。

很多 agent 框架同时维护两份数据：发给模型的 `messages` 数组，以及给 UI 和持久化用的记录。两者迟早会不一致。dsh 只保留一份：`Session` 是由类型化 `SessionEvent` 组成的**仅追加日志**，模型消息历史从日志派生，从不单独存储。

## 读懂输出

`main.ts` 运行一轮后打印两样东西：

- **会话日志**：`snapshotEvents()` 返回的全部事件，带 `◆` 的是会投影成模型消息的五种事件：`system/message`、`developer/message`、`user/message`、`assistant/message`、`tool/result`。
- **`deriveMessages()`**：从日志派生出的模型历史。

对照请求里的 `messages`，你会发现它和 `deriveMessages()` 的前几条完全一致。系统提示词也不例外：它以 `system/message` 事件进入日志，作为第 0 号节点，而不是请求上的一个旁路字段。所以日志能回答“某次请求用的是哪个版本的提示词”。

流程图的“数据流”视图里，这些事件都是从 `session` 发出的 `session/event · …`（简明模式下合成“写入会话日志”，点“完整步骤”逐条看）。回放时注意顺序：`system/message`、`user/message` 先写进日志，`请求 #1` 才发出。打开“步骤”列表，点到 `请求 #1`，展开的就是这次请求的 system 文本和最后一条消息。

其余事件是结构或元数据：`turn/*`、`step/*` 是边界，`request/header` 记录请求的完整“信封”，`agent/inbox/spliced` 记录 inbox 的变化。它们不进入模型历史。

## 动手：注入一条上下文

现在模型回答“我不知道当前分支”。用 `agent.inject()` 告诉它：

```ts
agent.inject(createUserMessage({
  content: [{ type: 'text', text: '当前分支：main' }],
  source: { kind: 'lesson-note' },
}))
```

再看输出：

1. `agent 状态： idle`。`inject` 不唤醒驱动器，注入的内容等到下一次有人唤醒驱动器时才进入请求。这保证插件注入上下文不会凭空触发一次模型调用。
2. 请求里多了一条 `user: 当前分支：main`，排在用户的问题之前，模型答对了。
3. 日志里多了一条 `user/message`，`deriveMessages()` 里也有它。回放里，`请求 #1` 之前多了一步 `session/event · user/message`。

注入的上下文也是 `user/message`，用 `source` 字段区分来源。dsh 里的文件变更通知、子目录 AGENTS.md、技能内容都走这条路。`source` 的 `kind` 由每个生产方通过声明合并 `MessageSourceMap` 自己声明，没有共享的“plugin”兜底类型。

## 这换来了什么

模型上下文完全由日志决定，于是几件难事都变成了日志操作：

- **压缩**：追加一条带 `surfaceOp: { op: 'replace', startSeq, endSeq }` 的摘要消息，替换掉一段旧历史。日志依旧只追加，被压缩的内容依旧可查。
- **fork**：复制一段日志前缀，开一个新会话。
- **回放与恢复**：从同一组事件重新派生。

代价是每种新的模型可见输入都要设计一种会话事件，还要考虑它的格式迁移。dsh 的态度是：宁可多写一个事件类型，也不让“模型当时看到了什么”变成一个答不上来的问题。
