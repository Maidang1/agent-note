import { createHarness } from './harness/index.ts'
import * as style from './style.ts'

const harness = await createHarness({
  script: {
    id: 'greeting',
    rules: [{ id: 'hello', match: { lastUserText: '你好' }, respond: { kind: 'text', chunks: ['小林你好。'] } }],
  },
})

await harness.plugin(style)
await harness.send('你好')
await harness.dispose()
