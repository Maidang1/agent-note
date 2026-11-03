import Approval from '@deepseek-ai/dsh-user-approval'
import { createHarness } from './harness/index.ts'
import * as answerer from './answerer.ts'
import * as review from './review.ts'

const harness = await createHarness({
  script: {
    id: 'reviewer',
    rules: [
      { id: 'post', match: { userIncludes: ['发布评审'] }, respond: { kind: 'tool-call', tool: 'post_review', arguments: { pr: 42, body: '可以合并' } }, maxUses: 2 },
      { id: 'done', match: { afterToolResult: true }, respond: { kind: 'text', chunks: ['处理完了'] } },
    ],
  },
  show: { messages: true },
})

await harness.plugin(review)
await harness.plugin(Approval)
await harness.plugin(answerer)

// 开发者在终端前：answerer 代表他回答。
await harness.send('给 PR #42 发布评审', 'dev')

// CI 里没人值守，这个会话不应该有人替它点“允许”。
const ci = await harness.agent('ci')
harness.root.approval.setPolicy(ci, 'never')

await harness.send('给 PR #42 发布评审', 'ci')

for (const session of ['dev', 'ci']) {
  const audit = harness.events(session).flatMap((event) => {
    if (!event.type.startsWith('approval/')) return []
    const { id: _id, callId: _callId, reason: _reason, ...data } = event.data as Record<string, unknown>
    return [`${event.type} ${JSON.stringify(data)}`]
  })
  console.log(`[${session}] 审计：`, audit)
}
await harness.dispose()
