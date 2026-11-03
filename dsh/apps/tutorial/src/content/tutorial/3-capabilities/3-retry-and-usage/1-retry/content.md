---
type: lesson
title: 暂时的失败交给重试
focus: /main.ts
terminal:
  open: true
  activePanel: 0
  panels: [['output', '输出'], ['terminal', '终端']]
---

# 暂时的失败交给重试

真实的模型服务会失败：限流（429）、服务端错误（5xx）、超时、连接断开。脚本模型现在也能失败：规则写成 `{ kind: 'error', code, message }`，适配器就抛出上游的 `LlmError`，`code` 是跨提供方通用的错误码。

`main.ts` 里有两个会话：

- `busy`：前两次请求被限流（`RATE_LIMIT`），提供方让我们 200 毫秒后再试，第三次才成功。
- `auth`：API key 错了（`AUTH`）。

## 现在的情况

```text
[user] [busy] 你好
[error] [busy] 轮次以错误结束  429 请求太多
  [busy] 失败的请求：1 次
[user] [auth] 在吗
[error] [auth] 轮次以错误结束  401 API key 无效
  [auth] 失败的请求：1 次
```

一次限流就让整轮对话失败了。失败的请求以 `assistant/attempt` 事件记在会话日志里，模型看不到它。

流程图的“数据流”视图里，`响应 #1 · 出错：429 请求太多` 之后是 `agent/request-error`，没有任何插件接手，这一轮就结束了。

## 动手

在 TODO 处挂上重试插件：

```ts
await harness.plugin(LlmRetry)
```

再运行：

```text
[user] [busy] 你好
[response] #3  你好！
[turn] [busy] 轮次结束  completed
  [busy] 第 1/5 次重试，RATE_LIMIT，等 200ms
  [busy] 第 2/5 次重试，RATE_LIMIT，等 200ms
  [busy] 失败的请求：2 次
[user] [auth] 在吗
[error] [auth] 轮次以错误结束  401 API key 无效
  [auth] 失败的请求：1 次
```

`busy` 失败了两次，第三次请求成功；`auth` 照旧失败，一次也没有重试。回放 `busy` 这一轮，`agent/request-error` 现在指向 `llm-retry`，后面跟着 `llm/retry`、`llm/retry-started`，然后是 `请求 #2`（简明模式下这两条日志合成“写入会话日志 ×2”，切到“完整步骤”能看到）。

## 谁决定重试

“能力 seam”一课提过：适配器禁用库内重试，一次适配器调用就是一次提供方尝试。重试由 agent loop 的 `agent/request-error` waterfall 决定，`dsh-llm-retry` 是挂在上面的执行器。

它自己没有配置，策略属于模型路由：每个适配器可以为自己的路由声明 `retryPolicy`，不声明就用默认的 normal 模式（[上游 dsh-llm](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/llm/llm/src/retry-policy.ts#L14-L24)）：

| 项 | 默认值 |
|---|---|
| 最多重试 | 5 次 |
| 可重试的错误码 | `EMPTY_RESPONSE`、`RATE_LIMIT`、`SERVER`、`TIMEOUT`、`TRANSPORT` |
| 退避 | 500 毫秒起，翻倍，最多 10 秒，±10% 抖动 |

`AUTH` 不在可重试的列表里，[执行器](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/llm/llm-retry/src/index.ts#L215-L216)直接调用 `next()` 交给下游，最后这一轮以错误结束。错误码在这里起了作用：执行器只看 `code`，不解析错误消息。

提供方给了 Retry-After 时，用它代替本地退避，所以这一课等的是确定的 200 毫秒。超过策略上限的 Retry-After 在 normal 模式下放弃重试。

## 先记账，再等待

每次重试，执行器先往会话日志追加 `llm/retry`（重试序号、错误、计划等多久），等待结束后再追加 `llm/retry-started`，然后返回 `{ kind: 'retry' }`，agent loop 在同一轮里重跑失败的那一步。

两件事因此成立：

- **重试计数在日志里。** 已经重试了几次，是从会话日志折叠出来的投影（新的一步或一轮开始时清零），不是内存里的计数器。重试请求和原始请求一样，可以从会话日志重建。
- **模型什么也看不到。** 重试事件、等待时间、失败的部分输出都不进入模型请求。把 `show` 改成 `{ messages: true }` 再运行，能看到请求 #1、#2、#3 的内容完全一样。
