import { createHarness } from './harness/index.ts'
import * as calculator from './harness/calculator.ts'
import * as policy from './policy.ts'

const harness = await createHarness({
  script: {
    id: 'calculator',
    rules: [
      { id: 'small', match: { lastUserText: '算 2+3' }, respond: { kind: 'tool-call', tool: 'add', arguments: { a: 2, b: 3 } } },
      { id: 'large', match: { lastUserText: '算 200+1' }, respond: { kind: 'tool-call', tool: 'add', arguments: { a: 200, b: 1 } } },
      { id: 'answer', match: { afterToolResult: true }, respond: { kind: 'text', chunks: ['好的'] } },
    ],
  },
})

await harness.plugin(calculator)
await harness.plugin(policy)
await harness.send('算 2+3')
await harness.send('算 200+1')
await harness.dispose()
