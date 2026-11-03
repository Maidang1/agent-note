import { createHarness } from './harness/index.ts'
import * as contributor from './contributor.ts'

const harness = await createHarness({
  script: { id: 'echo', rules: [{ id: 'ok', match: {}, respond: { kind: 'text', chunks: ['好'] } }] },
  show: { responses: false },
})

try {
  await harness.plugin(contributor, { order: '靠前' })
} catch (error) {
  console.log('配置被拒绝：', (error as Error).message)
}

await harness.plugin(contributor, { text: '回答时使用短句' })
await harness.send('你好')
await harness.dispose()
