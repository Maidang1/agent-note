import { createHarness } from './harness/index.ts'
import * as contributor from './contributor.ts'

const harness = await createHarness({
  script: { id: 'echo', rules: [{ id: 'ok', match: {}, respond: { kind: 'text', chunks: ['好'] } }] },
  show: { responses: false },
})

const fiber = await harness.plugin(contributor)
await harness.send('挂载之后')

await fiber.dispose()
await harness.send('卸载之后')

try {
  await harness.plugin(contributor)
  console.log('重新挂载成功')
} catch (error) {
  console.log('重新挂载失败：', (error as Error).message)
}
await harness.dispose()
