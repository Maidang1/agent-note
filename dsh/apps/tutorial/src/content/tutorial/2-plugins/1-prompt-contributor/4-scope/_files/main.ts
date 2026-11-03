import type { Context } from '@deepseek-ai/cordis'
import { createHarness } from './harness/index.ts'
import * as contributor from './contributor.ts'

const harness = await createHarness({
  script: { id: 'echo', rules: [{ id: 'ok', match: {}, respond: { kind: 'text', chunks: ['好'] } }] },
  show: { responses: false },
})

await harness.plugin(contributor)

// 会话 en 的 agent 在发布前运行 setup，agentCtx 是这个 agent 自己的作用域。
await harness.agent('en', (agentCtx: Context) => {
  // TODO：在 agentCtx 上注册同名片段 lesson:style，文本是“回答时使用英文”。
})

await harness.send('你好', 's')
await harness.send('你好', 'en')
await harness.dispose()
