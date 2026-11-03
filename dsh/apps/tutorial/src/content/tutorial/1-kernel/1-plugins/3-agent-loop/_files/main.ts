import { createHarness, kernel, scriptedModel } from './harness/index.ts'
import type { ModelScript } from './harness/index.ts'

// 确定性模型的脚本：按规则回答，不连接真实模型。
const script: ModelScript = {
  id: 'greeting',
  rules: [
    { id: 'hello', match: { lastUserText: '你好' }, respond: { kind: 'text', chunks: ['你好！', '有什么可以帮你？'] } },
  ],
}

// L1 的五个基础服务和 L2 的工具运行时。
const harness = await createHarness({
  kernel: ['session', 'session-projection', 'agent', 'system-prompt', 'llm', 'tools'],
  show: { plugins: true },
})

// L4：agent loop。
await harness.plugin(kernel['agent-loop'])

// TODO：挂上确定性模型适配器 scriptedModel，配置是 { script }

await harness.send('你好')
await harness.dispose()
