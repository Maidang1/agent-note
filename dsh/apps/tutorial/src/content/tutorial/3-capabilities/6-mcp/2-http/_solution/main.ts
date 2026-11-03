import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { createHarness } from './harness/index.ts'
import { startServer } from './pr-server.ts'

// 真实部署里，token 来自环境变量，不写进代码。
const token = 'lesson-token'
const server = await startServer(token)

const harness = await createHarness({
  script: {
    id: 'reviewer',
    rules: [
      { id: 'review', match: { afterToolResult: '- if (!text) return {}\n+ return JSON.parse(text)' }, respond: { kind: 'text', chunks: ['空文件会让 JSON.parse 抛错，原来的判空不能删'] } },
      { id: 'read', match: { declaredTools: ['mcp__pr__get_diff'] }, respond: { kind: 'tool-call', tool: 'mcp__pr__get_diff', arguments: { pr: 42 } } },
      { id: 'alone', match: {}, respond: { kind: 'text', chunks: ['我拿不到 diff，没法评审'] } },
    ],
  },
})

const mcp = await harness.plugin(McpClient, {
  serverName: 'pr',
  transport: 'streamable-http',
  url: server.url,
  // 每个 HTTP 请求都带上这些请求头。
  headers: { Authorization: `Bearer ${token}` },
})

await harness.send('评审 PR #42')
await harness.dispose()
await mcp.dispose()
server.close()
