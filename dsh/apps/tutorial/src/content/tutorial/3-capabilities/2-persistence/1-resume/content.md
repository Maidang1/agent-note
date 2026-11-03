---
type: lesson
title: 落盘与恢复
focus: /first-run.ts
---

# 落盘与恢复

“会话日志”一章说过，模型看到的一切都先记在会话日志里。到目前为止，这份日志只在内存里，进程一退出就没了。这一章把它写到磁盘上，再从磁盘接着聊。

这一课有两个进程：

- `first-run.ts` 是第一次运行。`main.ts` 在一个子进程里启动它，它说完“我叫小林”就退出。
- `main.ts` 剩下的部分是第二次运行：一个新的 Cordis 根，问“我叫什么？”。

两次运行共用 `store.ts` 里的配置：一个临时目录，`compression: 'none'` 让日志是逐行可读的 JSONL，而不是默认的 zstd 压缩帧。

## 现在的情况

展开终端：

```text
--- 第二次运行 ---
磁盘上的会话： []
[user] [s] 我叫什么？
[response] #1  我不知道你叫什么
```

第二次运行挂了 JSONL 持久化后端，但磁盘上一个会话也没有：第一次运行没挂后端，对话只存在于那个已经退出的进程里。

## 动手

在 `first-run.ts` 的 TODO 处挂上后端：

```ts
await harness.plugin(JsonlPersistence, store())
```

再运行：

```text
--- 第二次运行 ---
磁盘上的会话： [ 's' ]
日志文件里有 11 条事件： agent/inbox/spliced turn/start agent/inbox/spliced step/start system/message user/message request/header request/context assistant/message step/end turn/end
[user] [s] 我叫什么？
[response] #1  你叫小林
```

`main.ts` 看到磁盘上有会话 `s`，就调用 `harness.resume('s')`，而不是新建一个 agent。模型请求里带上了上一次运行的全部消息。

## 磁盘上是什么

日志文件在 `<root>/_no-cwd/s/` 下：会话没有工作目录时，项目目录名是 `_no-cwd`。文件第一行是 header（会话 id、格式版本、创建时间），之后每行一条会话事件，和 `harness.events()` 里的一模一样。持久化后端不理解事件的含义，只负责按顺序追加和读回。

后端是怎么拿到这些事件的？流程图的“注册”视图里，`session-persistence-jsonl` 有三条线指向 `session`：`on session/event`、`on session/flush`、`on session/disposed`。它监听会话日志，把每个会话的新事件路由到这个会话的写句柄。会话、agent loop 和其他插件都不知道有它。

它提供的服务 `sessionPersistence` 在图上是另一个节点 `session-persistence`。`main.ts` 用的 `list()` 就是它的方法，此外还有 `create`、`open`、`stat`、`flush`。上游 [dsh-session-persistence](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/session/session-persistence/README.zh.md) 只定义这个服务的约定，JSONL 是随产品交付的一种实现，换成数据库也可以，只要满足同样的保证：

- 只追加，已提交的事件不重写；
- 每个会话在一个进程里只有一个写入方；
- 读的时候不会读到写了一半的尾巴。

## 恢复不是重放

`resume()` 走的是上游 `agents.resume()`：agent loop 先拿到这个会话的写句柄，读出全部事件，用它们作为新会话的种子，再发布 agent。恢复出的 agent 不会重新请求模型、不会重跑工具，只是“记得”发生过什么。

恢复后的日志末尾多了一条 `session/end-seed`：它标出哪些事件是从磁盘继承来的。下一课会看到，种子并不总是完整的：进程可能死在一轮对话的半中间。
