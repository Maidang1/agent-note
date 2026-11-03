import { createHarness } from './harness/index.ts'
import * as secretFilter from './secret-filter.ts'

const harness = await createHarness({
  script: {
    id: 'echo',
    rules: [{ id: 'ok', match: {}, respond: { kind: 'text', chunks: ['收到'] } }],
  },
  show: { events: true },
})

await harness.plugin(secretFilter)
await harness.send('我的密码是 123456')
await harness.send('你好')

const logged = harness.events().filter(event => event.type === 'user/message').length
console.log(`会话日志里有 ${logged} 条 user/message`)
await harness.dispose()
