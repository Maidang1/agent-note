import * as TimeoutPolicy from '@deepseek-ai/dsh-tool-call-timeout-policy'
import * as CiLog from './ci-log.ts'
import { createHarness } from './harness/index.ts'

const harness = await createHarness({
  script: {
    id: 'reviewer',
    rules: [
      { id: 'timed-out', match: { afterToolResult: 'Error: tool call timed out after 300ms' }, respond: { kind: 'text', chunks: ['CI 日志下载超时了，我先评审代码，日志稍后再看'] } },
      { id: 'read', match: { afterToolResult: true }, respond: { kind: 'text', chunks: ['CI 全部通过，可以合并'] } },
      { id: 'fetch', match: {}, respond: { kind: 'tool-call', tool: 'fetch_ci_log', arguments: { pr: 42 } } },
    ],
  },
  show: { requests: false },
})
await harness.plugin(CiLog)
// 让工具定义里的 timeoutMs 生效。
await harness.plugin(TimeoutPolicy)

const started = Date.now()
await harness.send('评审 PR #42')
const seconds = (Date.now() - started) / 1000
for (const event of harness.events()) {
  if (event.type !== 'tool/result') continue
  const { message } = event.data
  console.log('工具结果：', message.content.map(block => block.type === 'text' ? block.text : '').join(''), message.isError ? '（错误）' : '')
}
console.log(seconds < 1 ? '不到 1 秒就结束了' : `用了 ${Math.round(seconds)} 秒`)
await harness.dispose()
