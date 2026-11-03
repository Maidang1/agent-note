import Compaction from '@deepseek-ai/dsh-compaction-basic'
import ToolResultPruner from '@deepseek-ai/dsh-compaction-tool-result-pruner'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import * as Logs from './logs.ts'
import { createHarness } from './harness/index.ts'

const harness = await createHarness({
  script: {
    id: 'small-window',
    // 和上一章一样：1500 token 的窗口，每次最多输出 500 token。
    contextWindow: 1500,
    maxOutput: 500,
    rules: [
      { id: 'summarize', match: { userIncludes: ['compaction engine'] }, respond: { kind: 'text', chunks: ['## Primary Request and Intent\n- 用户在逐段查看服务日志'] } },
      { id: 'checked', match: { afterToolResult: true }, respond: { kind: 'text', chunks: ['这段没有异常'] } },
      ...[1, 2, 3, 4, 5].map(part => ({
        id: `read-${part}`,
        match: { lastUserText: `看第 ${part} 段日志` },
        respond: { kind: 'tool-call' as const, tool: 'read_log', arguments: { part } },
      })),
    ],
  },
  show: { requests: false, truncate: 40 },
})
await harness.plugin(Logs)
await harness.plugin(TokenMeter)
// TODO：挂上 ToolResultPruner：超过 300 个字符的工具结果，只留开头 120 个和结尾 80 个字符。

await harness.plugin(Compaction, { headroomTokens: 0, maxTokens: 500, retainTokens: 300 })

for (let part = 1; part <= 5; part++) {
  await harness.send(`看第 ${part} 段日志`)
  const { totalTokens } = harness.root.tokenMeter.measure((await harness.agent()).session)
  console.log(`  上下文约 ${totalTokens} tokens（窗口 1500）`)
}

const events = harness.events()
console.log('摘要：', events.filter(event => event.type === 'compaction/summary').length, '次')
console.log('裁剪：', events.filter(event => event.type === 'compaction/prune').length, '条工具结果')
const results = events.filter(event => event.type === 'tool/result')
console.log('日志里的 tool/result：', results.length, '条')
// 裁剪事件后面紧跟着替换上去的 tool/result。
const lastPrune = events.findLastIndex(event => event.type === 'compaction/prune')
if (lastPrune >= 0) {
  const replaced = events[lastPrune + 1]!.data as { message: { content: Array<{ text?: string }> } }
  console.log('第 4 段裁剪后：\n' + replaced.message.content.map(block => block.text ?? '').join(''))
}
await harness.dispose()
