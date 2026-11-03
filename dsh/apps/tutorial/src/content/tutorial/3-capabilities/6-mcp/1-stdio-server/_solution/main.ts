import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { createHarness } from './harness/index.ts'

const harness = await createHarness({
  script: {
    id: 'reviewer',
    rules: [
      { id: 'review', match: { afterToolResult: '- if (!text) return {}\n+ return JSON.parse(text)' }, respond: { kind: 'text', chunks: ['空文件会让 JSON.parse 抛错，原来的判空不能删'] } },
      { id: 'failed', match: { afterToolResult: true }, respond: { kind: 'text', chunks: ['读不到 diff，没法评审'] } },
      { id: 'read', match: { declaredTools: ['mcp__pr__get_diff'] }, respond: { kind: 'tool-call', tool: 'mcp__pr__get_diff', arguments: { pr: 42 } } },
    ],
  },
  show: { messages: true },
})

// 每台 MCP 服务器一条配置。stdio 传输：客户端启动这个子进程，经它的标准输入输出说话。
const mcp = await harness.plugin(McpClient, {
  serverName: 'pr',
  transport: 'stdio',
  command: process.execPath,
  args: ['pr-server.ts'],
})

await harness.send('评审 PR #42')
await harness.dispose()
// 卸载插件：客户端关闭连接，子进程随之退出。不卸载的话，子进程会让 Node 一直不退出。
await mcp.dispose()
