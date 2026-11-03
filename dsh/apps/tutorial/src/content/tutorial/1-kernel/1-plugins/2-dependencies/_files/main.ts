import { createHarness, kernel, stateOf } from './harness/index.ts'

// 上一课挂好的基础服务，这次少了 system-prompt。
const harness = await createHarness({
  kernel: ['session', 'session-projection', 'agent', 'llm'],
  show: { plugins: true },
})

// 工具运行时：它 inject 了 systemPrompt。
const tools = await harness.plugin(kernel['tools'])

// TODO：挂上 system-prompt，再看 tools 的状态

console.log('tools 最后的状态：', stateOf(tools))
