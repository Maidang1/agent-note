import Compaction from '@deepseek-ai/dsh-compaction-basic'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import { createHarness } from './harness/index.ts'

/** 用户贴进来的一段日志，每段大约 300 token。 */
const segment = (index: number) => `第 ${index} 段日志：${'ERROR db.query timeout after 30s; '.repeat(36)}`

const harness = await createHarness({
  script: {
    id: 'small-window',
    // 一个只有 1500 token 上下文窗口的小模型，每次最多输出 500 token。
    contextWindow: 1500,
    maxOutput: 500,
    rules: [
      // 压缩插件请模型写摘要。
      { id: 'summarize', match: { userIncludes: ['compaction engine'] }, respond: { kind: 'text', chunks: ['## Primary Request and Intent\n- 用户在排查 db.query 超时，贴了 4 段日志'] } },
      // 第 1 段和第 5 段同时出现在请求里，就装不下了。
      { id: 'overflow', match: { userIncludes: ['第 1 段日志', '第 5 段日志'] }, respond: { kind: 'error', code: 'CONTEXT_WINDOW_EXCEEDED', message: '请求超出了 1500 token 的上下文窗口' } },
      { id: 'ack', match: {}, respond: { kind: 'text', chunks: ['收到'] } },
    ],
  },
  show: { responses: true, truncate: 40 },
})

await harness.plugin(TokenMeter)
await harness.plugin(Compaction, { headroomTokens: 0, maxTokens: 500, retainTokens: 300 })

for (let index = 1; index <= 5; index++) {
  await harness.send(segment(index))
  const { totalTokens } = harness.root.tokenMeter.measure((await harness.agent()).session)
  console.log(`  上下文约 ${totalTokens} tokens（窗口 1500）`)
}

for (const event of harness.events()) {
  if (event.type !== 'compaction/summary') continue
  const { shadowedTokenCount, shadowedSeqs } = event.data as { shadowedTokenCount: number; shadowedSeqs: number[] }
  console.log(`压缩：${shadowedSeqs.length} 条事件被摘要替换，约 ${shadowedTokenCount} tokens`)
}
await harness.dispose()
