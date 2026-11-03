---
type: lesson
title: 轮次与步骤
focus: /main.ts
---

# 轮次与步骤

一条用户消息进入 dsh 之后，到模型回复、工具执行完毕，中间按什么顺序发生了哪些事？先看 dsh 对“一来一回”的两个定义：

- **步骤（step）**：一次模型请求，加上这次响应里请求的所有工具调用。
- **轮次（turn）**：零个或多个步骤。它在领取第一条输入之前打开，在不再欠下任何工作时关闭。

一个典型的编码任务是一个轮次、多个步骤：模型读文件，改文件，跑测试，最后总结。

## 现在的情况

用户发出“1+2+3”。模型脚本先调用 `add(1, 2)`，拿到 `3` 后直接回答“结果是 3”，算错了。终端里能看到两个步骤：

```text
step/start → … → assistant/message → tool/call → tool/result → step/end
step/start → … → assistant/message → step/end
turn/end
```

第一个步骤的响应里有工具调用，循环执行工具、把 `tool/result` 写进日志，然后还欠模型一次请求，于是进入下一个步骤。第二个步骤的响应没有工具调用，轮次关闭。

在流程图的“数据流”视图里回放这一轮，看的是同一件事：每个步骤都从 `system-prompt/assemble`、`agent/pre-step` 开始，经过 `请求 #n` 和 `响应 #n`。`响应 #1 · 调用 add(…)` 之后，`tools` 发出四步 `tools/*`，然后才轮到 `请求 #2`。打开“步骤”列表（完整步骤模式），两个步骤的边界就是两条 `session/event · step/start`。

## 动手

改模型脚本，让模型拿到 `3` 之后再调用一次 `add(3, 3)`，拿到 `6` 之后再回答：

```ts
{ id: 'add-3-3', match: { afterToolResult: '3' }, respond: { kind: 'tool-call', tool: 'add', arguments: { a: 3, b: 3 } } },
{ id: 'answer', match: { afterToolResult: '6' }, respond: { kind: 'text', chunks: ['结果是 6'] } },
```

终端最后会打印“这一轮有 3 个步骤”，回放里也多了一组 `tools/*` 和 `请求 #3`。循环本身没有“要跑几步”的概念，步数由模型的响应决定：只要响应里还有工具调用，结果就要回传，就还有下一步。

## 全景：一个轮次的事件序列

上游架构文档给出了一个轮次的完整流程。带 `→ 日志` 的是追加到会话日志的持久事件，其余是实时扩展点：

```text
turn/start                                           → 日志
├─ 领取输入、system-prompt/assemble (waterfall)
├─ agent/pre-step                (waterfall) reject，或 enter(messages)
├─ step/start                                        → 日志
│  ├─ agent/request              (waterfall) 改写模型调用配置
│  ├─ system/message、user/message × N               → 日志
│  ├─ request/header、request/context（按需）          → 日志
│  ├─ 从日志派生并冻结请求
│  ├─ llm/stream                 (waterfall) 流式请求
│  ├─ assistant/message 或 assistant/attempt          → 日志
│  ├─ 工具调用 × M：tool/call → tools/* 流水线 → tool/result → 日志
│  └─ step/end                                       → 日志
├─ 还欠模型一次请求 → 下一个步骤
├─ agent/turn-stopping           (serial) 轮次即将关闭
turn/end                                             → 日志
```

对照终端里的 `[event]` 行，或者步骤列表里的 `session/event · …`，它们就是其中写进日志的那些。`agent/inbox/spliced` 是 inbox 的持久记录：输入先进入 agent 的 inbox，驱动器再从里面领取。

注意第 6 行：**请求是从日志派生出来的**，不是在内存里一边拼一边发。这保证了发出去的请求和日志里能重建出的请求完全一致。下一课看驱动器在步骤开始前的第一个决策点。
