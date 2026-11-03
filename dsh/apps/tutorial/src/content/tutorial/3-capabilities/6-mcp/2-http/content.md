---
type: lesson
title: 远端服务器：HTTP 与鉴权
focus: /main.ts
terminal:
  open: true
  activePanel: 0
  panels: [['output', '输出'], ['terminal', '终端']]
---

# 远端服务器：HTTP 与鉴权

上一课的服务器是本机上的一个子进程。很多 MCP 服务器跑在别处，要通过网络访问，还要鉴权。这时用 Streamable HTTP 传输：客户端把每条 JSON-RPC 消息 POST 到一个 URL，服务器在响应里回答。

`pr-server.ts` 还是那台手写的 PR 服务器，换成了 HTTP：协议内容和上一课一样，只是一行一条消息变成了一个请求一条消息。它只接受带 `Authorization: Bearer <token>` 的请求，其余一律回 401。

## 现在的情况

```text
[pr-server] POST server/discover
[warn] mcp-client  mcp-client(pr): connection attempt failed: SdkHttpError: Version negotiation failed: the server requires authorization (HTTP 401)
[warn] mcp-client  mcp-client(pr): connection failed; retrying in 500ms (attempt 1/10)
[request] #1  tools: (无)
[response] #1  我拿不到 diff，没法评审
```

客户端的第一个请求就被拒了。注意三件事：

1. 插件挂载并没有失败，harness 照常启动，只是没有 `mcp__pr__get_diff` 这个工具。一台连不上的服务器不该拖垮整个 agent（[上游 mcp-client](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/mcp/mcp-client/src/index.ts#L194-L202)）。
2. 失败只留在日志里，就是那两行 `[warn]`。如果不看日志，你只会发现模型说“拿不到 diff”。
3. 客户端会在后台重连：等 500 毫秒，之后每次翻倍，最多 30 秒，连续失败 10 次后放弃（[上游 README](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/mcp/mcp-client/README.zh.md)）。这一课很快就结束了，所以只看到第一次的预告。

## 动手

在 TODO 处带上请求头：

```ts
headers: { Authorization: `Bearer ${token}` },
```

再运行：

```text
[pr-server] POST server/discover
[pr-server] POST initialize
[pr-server] POST notifications/initialized
[pr-server] GET
[pr-server] POST tools/list
[request] #1  tools: mcp__pr__get_diff
[response] #1  调用 mcp__pr__get_diff({"pr":42})
[pr-server] POST tools/call
[response] #2  空文件会让 JSON.parse 抛错，原来的判空不能删
```

## 握手多了两步

和上一课的 stdio 比，服务器多收到两个请求：

- `server/discover`：客户端用的官方 SDK 先试新版协议（2026-07-28）的发现请求。这台服务器回答“方法不存在”，SDK 就退回旧版协议，用 `initialize` 握手。
- `GET`：客户端想打开一条由服务器主动推送消息的流（比如“工具列表变了”）。服务器回 405，表示不提供，客户端照常继续。

`notifications/initialized` 是通知，没有 `id`，服务器回 202 就行，不需要 JSON-RPC 响应。

## 什么时候应该直接失败

“连不上也照常启动”是默认行为。如果这台服务器是必需的，可以在配置里加 `failOnStartupError: true`：去掉 `headers`、加上这一项再运行，`harness.plugin()` 会直接抛出 `mcp-client(pr): initial connection or tool synchronization failed`，插件挂载被回滚。

两种选择都合理：可选的服务器，失败了让 agent 少一个工具接着干；必需的服务器，失败了就该让启动失败，而不是让 agent 在缺工具的状态下回答问题。

## token 不要写进代码

这一课为了能直接运行，把 token 写在了 `main.ts` 里。真实部署从环境变量读取。上游 README 里的配置是这样写的：

```yaml
headers:
  Authorization: !!js '`Bearer ${process.env.MCP_TOKEN}`'
```

`!!js` 让 `cordis.yml` 在加载时求值这段表达式，token 只存在于运行时的环境里，不进入配置文件和代码仓库。
