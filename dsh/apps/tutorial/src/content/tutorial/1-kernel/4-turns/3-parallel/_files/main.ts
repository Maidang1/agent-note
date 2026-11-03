import { createHarness } from './harness/index.ts'
import * as files from './files.ts'

const harness = await createHarness({
  script: {
    id: 'reader',
    rules: [
      // 模型在一次响应里请求读三个文件。
      { id: 'read', match: { lastUserText: '读一下 a.ts、b.ts、c.ts' }, respond: { kind: 'tool-calls', calls: ['a.ts', 'b.ts', 'c.ts'].map(path => ({ tool: 'read_file', arguments: { path } })) } },
      { id: 'done', match: { afterToolResult: true }, respond: { kind: 'text', chunks: ['三个文件都读完了'] } },
    ],
  },
  show: { messages: true },
})

await harness.plugin(files)
const started = Date.now()
await harness.send('读一下 a.ts、b.ts、c.ts')
console.log(`这一轮用了大约 ${Math.floor((Date.now() - started) / 100) * 100} 毫秒`)
await harness.dispose()
