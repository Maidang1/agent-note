import { createHarness } from './harness/index.ts'
import * as calculator from './harness/calculator.ts'

// 一个装好的 agent：上游的 dsh 内核，加上一个按脚本回答的假模型。
const harness = await createHarness({
  script: {
    id: 'demo',
    rules: [
      // 工具算完以后，模型把结果告诉用户。
      { id: 'answer', match: { afterToolResult: '3' }, respond: { kind: 'text', chunks: ['1+2 等于 3'] } },
      // 用户问 1+2 时，模型不自己算，而是请求调用 add 工具。
      { id: 'call-add', match: { lastUserText: '1+2' }, respond: { kind: 'tool-call', tool: 'add', arguments: { a: 1, b: 2 } } },
      // 其他消息，模型直接回答。
      { id: 'chat', match: {}, respond: { kind: 'text', chunks: ['你好！我会做加法，问我 1+2 试试。'] } },
    ],
  },
})

// 给 agent 一个工具：能做加法的 add。
await harness.plugin(calculator)

// TODO：把“你好”换成“1+2”，看 agent 怎样借助工具回答
await harness.send('你好')
await harness.dispose()
