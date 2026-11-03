import { createHarness } from './harness/index.ts'
import * as calculator from './harness/calculator.ts'
import * as branch from './branch.ts'
import * as contributor from './contributor.ts'
import * as toolGuard from './tool-guard.ts'

const harness = await createHarness({
  script: {
    id: 'calculator',
    rules: [
      { id: 'answer', match: { afterToolResult: true }, respond: { kind: 'text', chunks: ['结果是 3'] } },
      // 最后一条 user 消息是运行时上下文快照，所以按“用户说过”匹配。
      { id: 'call', match: { userIncludes: ['1+2'] }, respond: { kind: 'tool-call', tool: 'add', arguments: { a: 1, b: 2 } } },
    ],
  },
  show: { requests: false },
})

// 前面几章写的插件：一个工具、一段提示词、一份运行时上下文。
await harness.plugin(calculator)
await harness.plugin(contributor)
await harness.plugin(branch)

await harness.plugin(toolGuard, { deny: [] })

await harness.send('1+2')
await harness.dispose()
