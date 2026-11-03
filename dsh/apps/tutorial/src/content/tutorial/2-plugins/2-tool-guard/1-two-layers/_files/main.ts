import { createHarness } from './harness/index.ts'
import * as calculator from './harness/calculator.ts'
import * as toolGuard from './tool-guard.ts'

const harness = await createHarness({
  script: {
    id: 'calculator',
    rules: [
      { id: 'call', match: { lastUserText: '1+2' }, respond: { kind: 'tool-call', tool: 'add', arguments: { a: 1, b: 2 } } },
      { id: 'answer', match: { afterToolResult: true }, respond: { kind: 'text', chunks: ['好的'] } },
    ],
  },
  show: { requests: false },
})

await harness.plugin(calculator)
await harness.plugin(toolGuard)
await harness.send('1+2')
await harness.dispose()
