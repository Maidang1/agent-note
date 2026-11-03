import * as RepeatToolReminder from '@deepseek-ai/dsh-repeat-tool-reminder'
import * as Ci from './ci.ts'
import { createHarness } from './harness/index.ts'

const poll = { kind: 'tool-call' as const, tool: 'check_ci', arguments: { pr: 42 } }
const harness = await createHarness({
  script: {
    id: 'poller',
    rules: [
      // 这个模型有点固执：温和的提醒它不理，看到“不要再用这些参数调用”才停。
      { id: 'stop', match: { userIncludes: ['Do not call this tool with these exact arguments again'] }, respond: { kind: 'text', chunks: ['CI 一直是 pending，我先停下，等它跑完再看'] } },
      // 结果是 pending 就再查一次，最多再查 9 次。
      { id: 'poll', match: { afterToolResult: 'pending' }, respond: poll, maxUses: 9 },
      { id: 'give-up', match: { afterToolResult: true }, respond: { kind: 'text', chunks: ['查了 10 次还是 pending，放弃了'] } },
      { id: 'first', match: {}, respond: poll },
    ],
  },
  show: { requests: false },
})
await harness.plugin(Ci)
// 默认在连续第 3、5、8 次相同调用后提醒。
await harness.plugin(RepeatToolReminder)

await harness.send('PR #42 的 CI 过了吗？')

const events = harness.events()
console.log('check_ci 调用了', events.filter(event => event.type === 'tool/call').length, '次')
for (const event of events) {
  if (event.type !== 'user/message') continue
  const { source, content } = event.data
  if (source.kind !== 'repeat-tool-reminder' || source.form !== 'notice') continue
  console.log(`\n提醒（${source.summary}）：\n${content.map(block => block.type === 'text' ? block.text : '').join('')}`)
}
await harness.dispose()
