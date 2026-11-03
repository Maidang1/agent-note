import { checkpoint, createHarness } from './harness/index.ts'
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
})

// 观察后置阶段：工具结果在回到模型之前经过这里。
harness.root.on('tools/post-execute', async (exec, result, next) => {
  checkpoint(harness.root, 'post-execute', { tool: exec.name, isError: result.isError })
  return next()
})

await harness.plugin(calculator)
await harness.plugin(toolGuard, { deny: ['add'] })
await harness.send('1+2')
await harness.dispose()
