import { createHarness } from './harness/index.ts'
import * as calculator from './harness/calculator.ts'

const harness = await createHarness({
  script: {
    id: 'calculator',
    rules: [
      { id: 'add-1-2', match: { lastUserText: '1+2+3', declaredTools: ['add'] }, respond: { kind: 'tool-call', tool: 'add', arguments: { a: 1, b: 2 } } },
      // TODO：拿到 3 之后，模型应该再调用一次 add(3, 3)，拿到 6 之后再回答。
      { id: 'answer', match: { afterToolResult: '3' }, respond: { kind: 'text', chunks: ['结果是 3'] } },
    ],
  },
  show: { requests: false, events: true },
})

await harness.plugin(calculator)
await harness.send('1+2+3')

const steps = harness.events().filter(event => event.type === 'step/start').length
console.log(`这一轮有 ${steps} 个步骤`)
await harness.dispose()
