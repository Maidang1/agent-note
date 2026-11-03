// 一个最小的 MCP 服务器：标准输入输出上，一行一条 JSON-RPC 消息。
import { createInterface } from 'node:readline'

const diffs: Record<number, string> = {
  42: '- if (!text) return {}\n+ return JSON.parse(text)',
}

const reply = (id: number, result: unknown) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
const fail = (id: number, message: string) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message } }) + '\n')

createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  // 标准输出留给协议，日志写到标准错误。
  const tool = message.params?.name === undefined ? '' : ` ${message.params.name}`
  process.stderr.write(`[pr-server] 收到 ${message.method}${tool}\n`)

  if (message.method === 'initialize') {
    reply(message.id, {
      protocolVersion: message.params.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: 'pr-server', version: '1.0.0' },
      instructions: 'PR 的 diff 来自本地存档，不是实时数据。',
    })
  } else if (message.method === 'tools/list') {
    reply(message.id, {
      tools: [{
        name: 'get_diff',
        description: '读取一个 PR 的 diff',
        inputSchema: { type: 'object', properties: { pr: { type: 'number' } }, required: ['pr'] },
      }],
    })
  // TODO：处理 tools/call。message.params 里有 name 和 arguments，
  // 结果的格式是 { content: [{ type: 'text', text: ... }] }。
  } else if (message.id !== undefined) {
    fail(message.id, `Method not found: ${message.method}`)
  }
})
