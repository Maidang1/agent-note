---
type: lesson
title: 接一台 MCP 服务器
focus: /pr-server.ts
terminal:
  open: true
  activePanel: 0
  panels: [['output', '输出'], ['terminal', '终端']]
---

# 接一台 MCP 服务器

到目前为止，工具都是在插件里用 `defineTool` 写的，和 harness 跑在同一个进程里。MCP（Model Context Protocol）让工具住在另一个进程里：任何程序只要按协议回答几个请求，就能把自己的工具交给模型用。

`dsh-mcp-client` 是这座桥。每台服务器一条配置，它连上服务器，问到工具列表，把每个工具登记进 `ctx.tools`。

这一课的服务器是手写的，就是 `pr-server.ts`，不到 40 行，没有用任何 SDK。stdio 传输下，协议很朴素：客户端启动服务器进程，往它的标准输入写一行 JSON-RPC 请求，从标准输出读一行回答。

## 现在的情况

```text
[request] #1  tools: mcp__pr__get_diff
    system
    │ 你是一个助手
    │
    │ ### MCP server: pr
    │
    │ PR 的 diff 来自本地存档，不是实时数据。
[response] #1  调用 mcp__pr__get_diff({"pr":42})
[request] #2  tools: mcp__pr__get_diff
    │ tool: Error: Method not found: tools/call
[response] #2  读不到 diff，没法评审
[turn] [s] 轮次结束  completed
[pr-server] 收到 initialize
[pr-server] 收到 notifications/initialized
[pr-server] 收到 tools/list
[pr-server] 收到 tools/call get_diff
```

最后四行是服务器写到标准错误的日志（标准输出留给协议，日志只能写到标准错误）。从日志看，在模型第一次请求之前，客户端已经完成了两件事：

1. `initialize`：握手。客户端报上协议版本，服务器回答自己的能力（这里只有 `tools`）、名字和一段说明 `instructions`。客户端再发一条 `notifications/initialized` 通知，这是通知，没有 `id`，不用回答。
2. `tools/list`：问工具列表。服务器回答了 `get_diff` 和它的参数 schema。

插件的激活会等这两步做完（[上游 mcp-client](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/mcp/mcp-client/src/index.ts#L194-L199)），所以 `harness.plugin()` 返回时工具已经在了，请求 #1 里就有 `mcp__pr__get_diff`。

模型调用了它，服务器却不认识 `tools/call`，回了一个 JSON-RPC 错误。客户端把错误转成工具失败，模型看到的是 `Error: Method not found: tools/call`。

## 动手

在 `pr-server.ts` 的 TODO 处处理 `tools/call`：

```ts
} else if (message.method === 'tools/call') {
  const diff = diffs[message.params.arguments.pr]
  reply(message.id, diff === undefined
    ? { content: [{ type: 'text', text: `没有 PR #${message.params.arguments.pr}` }], isError: true }
    : { content: [{ type: 'text', text: diff }] })
```

再运行：

```text
[request] #2  tools: mcp__pr__get_diff
    │ tool: - if (!text) return {}
    │ + return JSON.parse(text)
[response] #2  空文件会让 JSON.parse 抛错，原来的判空不能删
```

## 两个名字

模型看到的工具叫 `mcp__pr__get_diff`，服务器只知道 `get_diff`。公开名字由配置里的 `serverName` 和服务器的原名拼成（节选自[上游 tools.ts](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/mcp/mcp-client/src/tools.ts#L81-L87)）：

```ts
export function publicToolName(serverName: string, rawName: string): string {
  const joined = `mcp__${serverName}__${rawName}`
  const normalized = joined.replace(INVALID_NAME_CHARS, '_')
  if (normalized === joined && normalized.length <= MAX_PUBLIC_NAME_LENGTH) return normalized
  // 名字要改写或截断时，追加一段哈希，保证不同的工具不会撞名
}
```

调用时，发给服务器的始终是原名（[上游 tools.ts](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/mcp/mcp-client/src/tools.ts#L138-L141)）。服务器日志的最后一行是 `收到 tools/call get_diff`，服务器从来不知道 `mcp__pr__` 这个前缀。

前缀用的是本地配置的 `serverName`，不是服务器自报的 `serverInfo.name`（这一课是 `pr-server`）。服务器的名字不可信，升级时也可能变；用本地名字，两台服务器都有 `search` 工具时也能共存：`mcp__github__search` 和 `mcp__web__search`。名字稳定，会话日志里的旧调用和按工具名写的权限规则在重启后也还能对上。

## 服务器的说明进了 system prompt

`initialize` 回答里的 `instructions`，被客户端加上一行标题（[上游 connection.ts](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/mcp/mcp-client/src/connection.ts#L319)），作为一个 section 登记到 system prompt（节选自[上游 server-context.ts](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/mcp/mcp-client/src/server-context.ts#L32-L39)）：

```ts
inner.systemPrompt.section({
  name: `mcp:${server}`,
  order: inner.systemPrompt.getSectionOrder('MCP_SERVERS'),
  interpolate: false,
  text: () => connection.instructions(),
})
```

在 system prompt 里是这样：

```text
### MCP server: pr

PR 的 diff 来自本地存档，不是实时数据。
```

这和“提示词贡献者”那一章自己写的 section 是同一套机制。`interpolate: false` 表示不替换 `{{变量}}`：服务器的文字原样进入，里面就算有花括号也不会被当成变量。反过来说，接入一台服务器，也就是信任它写给模型的话。

## 失败要说出来

把 `main.ts` 里脚本模型的参数改成 `{ pr: 43 }` 再运行，模型看到：

```text
    │ tool: Error: 没有 PR #43
```

服务器的回答带着 `isError: true`。客户端遇到它就抛错（[上游 tools.ts](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/mcp/mcp-client/src/tools.ts#L296-L299)），工具运行时把这次调用记成失败，模型不会把错误文本当成正常结果。

## 收尾

`main.ts` 最后卸载了 MCP 插件：

```ts
await mcp.dispose()
```

插件的副作用里有关闭连接，卸载时子进程随之退出。`harness.dispose()` 只结束 agent，不卸载插件；不卸载的话，连接一直开着，Node 不会退出。

## 看流程图

结构图里多了 `mcp-client`，它只依赖 `tools`。回放这一轮，`tools/execute · mcp__pr__get_diff` 指向 `mcp-client`：在工具运行时看来，这和本地工具没有区别，前置检查、后置处理这些钩子照样经过。
