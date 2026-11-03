import { readFileSync } from 'node:fs'
import LocalSpillStore from '@deepseek-ai/dsh-spill-local'
import * as SpillPolicy from '@deepseek-ai/dsh-spill-policy'
import * as Logs from './logs.ts'
import { createHarness } from './harness/index.ts'

const harness = await createHarness({
  script: {
    id: 'reader',
    rules: [
      { id: 'done', match: { afterToolResult: true }, respond: { kind: 'text', chunks: ['日志看完了'] } },
      { id: 'read', match: {}, respond: { kind: 'tool-call', tool: 'read_log', arguments: {} } },
    ],
  },
  show: { requests: false },
})
await harness.plugin(Logs)
// 工具结果超过 200 token（估算）就换成首尾预览加一行提示。
await harness.plugin(SpillPolicy, { maxInlineTokens: 200 })
// 本地 spill 后端：完整结果存成本机临时目录里的文件。
await harness.plugin(LocalSpillStore)

await harness.send('看看服务日志')

// 模型看到的工具结果，就是会话日志里的 tool/result。
let text = ''
for (const event of harness.events()) {
  if (event.type === 'tool/result') text = event.data.message.content.map(block => block.type === 'text' ? block.text : '').join('')
}
console.log(`模型看到的工具结果：${Buffer.byteLength(text)} 字节，${text.includes('ERROR') ? '看得到' : '看不到'} ERROR 那一行`)

const stored = /stored at: (.+?)\. Use read/.exec(text)?.[1]
if (stored) {
  console.log('结尾的提示：', text.slice(text.lastIndexOf('(Omitted')).replace(stored, '<路径>'))
  const full = readFileSync(stored, 'utf8').split('\n')
  const line = full.findIndex(entry => entry.includes('ERROR'))
  console.log(`完整结果文件：${full.length} 行，ERROR 在第 ${line + 1} 行：${full[line]}`)
}
await harness.dispose()
