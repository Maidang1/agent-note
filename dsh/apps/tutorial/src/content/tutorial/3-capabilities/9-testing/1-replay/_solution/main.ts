import { readFileSync } from 'node:fs'
import * as LlmReplay from '@deepseek-ai/dsh-llm-replay'
import * as Calculator from './calculator.ts'
import { createHarness } from './harness/index.ts'

const fixture = 'fixtures/add.jsonl'

// 没有可用的模型：脚本一条规则都没有，任何请求都会失败。
const harness = await createHarness({ script: { id: 'offline', rules: [] } })
await harness.plugin(Calculator)
// 从 fixture 回放录制时模型的输出。
await harness.plugin(LlmReplay, { file: fixture })

await harness.send('1+2 等于几？')

// 回归检查：这次的工具结果，和录制时一样吗？
type Row = { type: string; data: { message?: { content: Array<{ type: string; text?: string }> } } }
const toolResults = (events: readonly Row[]) => events
  .filter(event => event.type === 'tool/result')
  .map(event => event.data.message?.content.map(block => block.text ?? '').join('') ?? '')
const recorded = toolResults(readFileSync(fixture, 'utf8').trim().split('\n').slice(1).map(line => JSON.parse(line) as Row))
const live = toolResults(harness.events() as readonly Row[])
console.log('录制时的工具结果：', JSON.stringify(recorded))
console.log('这次的工具结果：', JSON.stringify(live))
console.log(JSON.stringify(recorded) === JSON.stringify(live) ? '一致' : '不一致')
await harness.dispose()
