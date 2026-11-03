// 一个最小的 MCP 服务器，走 Streamable HTTP：每条 JSON-RPC 消息是一次 POST。
import { createServer } from 'node:http'

const diffs: Record<number, string> = {
  42: '- if (!text) return {}\n+ return JSON.parse(text)',
}

/** 在随机端口上启动服务器，只接受带 `Authorization: Bearer <token>` 的请求。 */
export async function startServer(token: string) {
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    const message = body ? JSON.parse(body) : undefined
    console.log(`[pr-server] ${request.method} ${message?.method ?? ''}`)

    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401).end()
      return
    }
    // GET 是客户端想打开服务器推送的流，这个服务器不提供。
    if (request.method !== 'POST') {
      response.writeHead(405).end()
      return
    }
    // 通知没有 id，不用回答。
    if (message.id === undefined) {
      response.writeHead(202).end()
      return
    }
    const reply = (payload: object) => response
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ jsonrpc: '2.0', id: message.id, ...payload }))

    if (message.method === 'initialize') {
      reply({ result: { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'pr-server', version: '1.0.0' } } })
    } else if (message.method === 'tools/list') {
      reply({ result: { tools: [{ name: 'get_diff', description: '读取一个 PR 的 diff', inputSchema: { type: 'object', properties: { pr: { type: 'number' } }, required: ['pr'] } }] } })
    } else if (message.method === 'tools/call') {
      reply({ result: { content: [{ type: 'text', text: diffs[message.params.arguments.pr] ?? '没有这个 PR' }] } })
    } else {
      reply({ error: { code: -32601, message: `Method not found: ${message.method}` } })
    }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  return { url: `http://127.0.0.1:${port}/mcp`, close: () => server.close() }
}
