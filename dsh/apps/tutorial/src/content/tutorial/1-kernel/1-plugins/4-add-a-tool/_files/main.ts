import { createHarness } from './harness/index.ts'
import * as calculator from './calculator.ts'

const harness = await createHarness({
  script: {
    id: 'calculator',
    rules: [
      // 请求里声明了 add 工具时，模型调用它。
      { id: 'call-add', match: { lastUserText: '1+2', declaredTools: ['add'] }, respond: { kind: 'tool-call', tool: 'add', arguments: { a: 1, b: 2 } } },
      // 工具结果是 3 时，模型给出答案。
      { id: 'answer', match: { afterToolResult: '3' }, respond: { kind: 'text', chunks: ['结果是 3'] } },
      // 没有可用的工具时，模型只能这样回答。
      { id: 'no-tool', match: { lastUserText: '1+2' }, respond: { kind: 'text', chunks: ['我没有可以用的计算工具'] } },
    ],
  },
})

await harness.plugin(calculator)
await harness.send('1+2')
await harness.dispose()
