// 录制：用（脚本扮演的）真模型跑一次，把会话日志存成 fixture。
// 在终端里运行 `node record.ts` 可以重新录制。
import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import * as Calculator from './calculator.ts'
import { createHarness } from './harness/index.ts'

const harness = await createHarness({
  script: {
    id: 'model',
    rules: [
      { id: 'answer', match: { afterToolResult: '3' }, respond: { kind: 'text', chunks: ['1+2 等于 3'] } },
      { id: 'call', match: { lastUserText: '1+2 等于几？' }, respond: { kind: 'tool-call', tool: 'add', arguments: { a: 1, b: 2 } } },
    ],
  },
})
const root = mkdtempSync(join(tmpdir(), 'dsh-sessions-'))
await harness.plugin(JsonlPersistence, { root, compression: 'none' })
await harness.plugin(Calculator)
await harness.send('1+2 等于几？')
await harness.dispose()

const dir = join(root, '_no-cwd/s')
copyFileSync(join(dir, readdirSync(dir).find(name => name.endsWith('.jsonl'))!), 'fixtures/add.jsonl')
console.log('已录制到 fixtures/add.jsonl')
