import TokenMeter from '@deepseek-ai/dsh-token-meter'
import { createHarness } from './harness/index.ts'
import * as calculator from './harness/calculator.ts'
import * as budget from './budget.ts'

const harness = await createHarness({
  script: {
    id: 'looping',
    rules: [
      // 每次响应都报告 token 用量：输入 1200，输出 50。
      { id: 'first', match: { lastUserText: '算 1+1，多验算几遍' }, respond: { kind: 'tool-call', tool: 'add', arguments: { a: 1, b: 1 } }, usage: { input: 1200, output: 50 } },
      // 一个停不下来的模型：拿到工具结果又调用一次，一共 6 次。
      { id: 'again', match: { afterToolResult: true }, respond: { kind: 'tool-call', tool: 'add', arguments: { a: 1, b: 1 } }, usage: { input: 1200, output: 50 }, maxUses: 5 },
      { id: 'done', match: { afterToolResult: true }, respond: { kind: 'text', chunks: ['验算完了，等于 2'] }, usage: { input: 1200, output: 20 } },
    ],
  },
  show: { requests: false },
})

await harness.plugin(calculator)
await harness.plugin(TokenMeter)
await harness.plugin(budget, { maxTokens: 3000 })
await harness.send('算 1+1，多验算几遍')

const usage = harness.root.sessionProjections.stateOf((await harness.agent()).session, 'tokenUsage')
console.log('会话总用量：', usage?.totals)
await harness.dispose()
