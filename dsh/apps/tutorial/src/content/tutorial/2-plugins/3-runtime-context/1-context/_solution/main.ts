import { createHarness } from './harness/index.ts'
import * as branch from './branch.ts'

const harness = await createHarness({
  script: { id: 'echo', rules: [{ id: 'ok', match: {}, respond: { kind: 'text', chunks: ['好'] } }] },
  show: { messages: true, responses: false },
})

await harness.plugin(branch)
await harness.send('第一条')
await harness.send('第二条')
branch.state.current = 'feat/login'
await harness.send('第三条')

const types = harness.events().map(event => event.type)
console.log('system/message 事件：', types.filter(type => type === 'system/message').length)
console.log('user/message 事件：', types.filter(type => type === 'user/message').length)
await harness.dispose()
