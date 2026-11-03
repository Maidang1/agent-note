import type { Context } from '@deepseek-ai/cordis'
import { createHarness } from './harness/index.ts'
import * as calculator from './harness/calculator.ts'
import { messageText } from './harness/scripted-llm.ts'
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
// TODO：只限制 strict 会话。把这一行挪进下面的 setup，用 agentCtx 挂载。
await harness.plugin(toolGuard, { deny: ['add'] })

await harness.agent('strict', async (agentCtx: Context) => {
})

await harness.send('1+2', 's')
await harness.send('1+2', 'strict')
for (const id of ['s', 'strict']) {
  const result = harness.events(id).find(event => event.type === 'tool/result')
  const text = result?.type === 'tool/result' ? messageText(result.data.message) : '(无)'
  console.log(`[${id}] 工具结果：${text}`)
}
await harness.dispose()
