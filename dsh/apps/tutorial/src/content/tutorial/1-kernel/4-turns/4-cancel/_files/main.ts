import { createHarness } from './harness/index.ts'
import * as scanner from './scanner.ts'

const harness = await createHarness({
  script: {
    id: 'scanner',
    rules: [
      { id: 'scan', match: { lastUserText: '扫描整个仓库' }, respond: { kind: 'tool-call', tool: 'scan', arguments: { dir: '.' } } },
      { id: 'done', match: { afterToolResult: true }, respond: { kind: 'text', chunks: ['扫描完了'] } },
      // 用户插话（steer）之后的回答。
      { id: 'steered', match: { lastUserText: '只扫 src 目录' }, respond: { kind: 'text', chunks: ['好，下次只扫 src'] } },
    ],
  },
})

await harness.plugin(scanner)
const agent = await harness.agent()

const started = Date.now()
const turn = harness.send('扫描整个仓库')
// 100 毫秒后，用户按下 Esc。
await new Promise(resolve => setTimeout(resolve, 100))
console.log('  用户打断')
agent.cancel({ kind: 'user' })
await turn
console.log(`打断之后又等了大约 ${Math.floor((Date.now() - started - 100) / 100) * 100} 毫秒`)

for (const event of harness.events()) {
  if (event.type !== 'tool/result') continue
  const { content, isError } = event.data.message
  const text = content.map(block => (block.type === 'text' ? block.text : '')).join('')
  console.log('日志里的工具结果：', text, isError ? '（错误）' : '')
}
await harness.dispose()
