import { createHarness } from './harness/index.ts'
import * as calculator from './harness/calculator.ts'

const harness = await createHarness({
  script: {
    id: 'demo',
    rules: [
      { id: 'answer', match: { afterToolResult: '3' }, respond: { kind: 'text', chunks: ['1+2 等于 3'] } },
      { id: 'call-add', match: { lastUserText: '1+2' }, respond: { kind: 'tool-call', tool: 'add', arguments: { a: 1, b: 2 } } },
      { id: 'who', match: { lastUserText: '你是谁' }, respond: { kind: 'text', chunks: ['我是一个按脚本回答的模型'] } },
    ],
  },
})

await harness.plugin(calculator)

const question = '你是谁'
await harness.send(question)
await harness.dispose()
