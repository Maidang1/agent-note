import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { messageText } from './harness/scripted-llm.ts'
import { createHarness } from './harness/index.ts'

// 插件通过声明合并给注入的消息声明自己的来源。
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'lesson-note': { kind: 'lesson-note' }
  }
}

const harness = await createHarness({
  script: {
    id: 'branch',
    rules: [
      { id: 'knows', match: { userIncludes: ['当前分支：main'] }, respond: { kind: 'text', chunks: ['你在 main 分支上'] } },
      { id: 'unknown', match: {}, respond: { kind: 'text', chunks: ['我不知道当前分支'] } },
    ],
  },
  show: { messages: true },
})

const agent = await harness.agent()

// inject 不唤醒驱动器：上下文等到下一次有人唤醒时才进入请求。
agent.inject(createUserMessage({
  content: [{ type: 'text', text: '当前分支：main' }],
  source: { kind: 'lesson-note' },
}))

console.log('agent 状态：', agent.status)
await harness.send('现在在哪个分支？')

// 会话日志：唯一真源。
const VISIBLE = new Set(['system/message', 'developer/message', 'user/message', 'assistant/message', 'tool/result'])
console.log('\n会话日志：')
for (const event of agent.session.snapshotEvents()) {
  console.log(`  ${String(event.seq).padStart(2)} ${VISIBLE.has(event.type) ? '◆' : ' '} ${event.type}`)
}

// 模型历史从日志派生，从不单独存储。
console.log('\nderiveMessages()：')
for (const message of agent.session.deriveMessages()) {
  console.log(`  ${message.role}: ${messageText(message)}`)
}
await harness.dispose()
