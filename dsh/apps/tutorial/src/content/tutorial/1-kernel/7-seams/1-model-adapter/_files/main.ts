import { createHarness } from './harness/index.ts'
import * as calculator from './harness/calculator.ts'
import * as echoLlm from './echo-llm.ts'

const harness = await createHarness({
  // 这一课不用确定性模型脚本：请求全部路由到 echo 提供方。
  script: { id: 'unused', rules: [] },
  model: { provider: 'echo', model: 'echo-1' },
})

await harness.plugin(calculator)
await harness.plugin(echoLlm)
await harness.send('2+3')
await harness.dispose()
