import Approval from '@deepseek-ai/dsh-user-approval'
import { createHarness } from './harness/index.ts'
import * as answerer from './answerer.ts'
import * as review from './review.ts'

const harness = await createHarness({
  script: {
    id: 'reviewer',
    rules: [
      { id: 'post', match: { userIncludes: ['发布评审'] }, respond: { kind: 'tool-call', tool: 'post_review', arguments: { pr: 42, body: '可以合并' } }, maxUses: 1 },
      { id: 'done', match: { afterToolResult: true }, respond: { kind: 'text', chunks: ['处理完了'] } },
    ],
  },
})

await harness.plugin(review)
await harness.plugin(Approval)
await harness.plugin(answerer)
await harness.send('给 PR #42 发布评审')

// 审批服务把每次请求和结果写进会话日志。
for (const event of harness.events()) {
  if (!event.type.startsWith('approval/')) continue
  const { id: _id, ...data } = event.data as Record<string, unknown>
  console.log(`审计 ${event.type}`, JSON.stringify(data))
}
await harness.dispose()
