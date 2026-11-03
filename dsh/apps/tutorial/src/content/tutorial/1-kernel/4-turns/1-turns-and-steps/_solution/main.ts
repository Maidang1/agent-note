import { createHarness } from './harness/index.ts'
import * as calculator from './harness/calculator.ts'

const harness = await createHarness({
  script: {
    id: 'calculator',
    rules: [
      { id: 'add-1-2', match: { lastUserText: '1+2+3', declaredTools: ['add'] }, respond: { kind: 'tool-call', tool: 'add', arguments: { a: 1, b: 2 } } },
      { id: 'add-3-3', match: { afterToolResult: '3' }, respond: { kind: 'tool-call', tool: 'add', arguments: { a: 3, b: 3 } } },
      { id: 'answer', match: { afterToolResult: '6' }, respond: { kind: 'text', chunks: ['结果是 6'] } },
    ],
  },
  show: { requests: false, events: true },
})

await harness.plugin(calculator)
await harness.send('1+2+3')

const steps = harness.events().filter(event => event.type === 'step/start').length
console.log(`这一轮有 ${steps} 个步骤`)
await harness.dispose()
