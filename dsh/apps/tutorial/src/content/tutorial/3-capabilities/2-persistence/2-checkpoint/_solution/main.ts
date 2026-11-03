import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {} from '@deepseek-ai/dsh-session-persistence'
import * as JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { createHarness } from './harness/index.ts'
import * as review from './review.ts'
import { script, store } from './store.ts'

const root = mkdtempSync(join(tmpdir(), 'dsh-sessions-'))
console.log('--- 第一次运行 ---')
const crashed = spawnSync(process.execPath, ['first-run.ts'], { stdio: 'inherit', env: { ...process.env, SESSION_ROOT: root } })
console.log(`进程退出，退出码 ${crashed.status}`)

console.log('--- 重启 ---')
const harness = await createHarness({ script, show: { messages: true } })
await harness.plugin(JsonlPersistence, store(root))
await harness.plugin(review)

const stored = await harness.root.sessionPersistence.list()
console.log('磁盘上的会话：', stored.map(snapshot => snapshot.header.id))
if (stored.length) {
  const agent = await harness.resume('s')
  console.log('恢复出的事件：', agent.session.snapshotEvents().map(event => event.type).join(' '))
}
await harness.send('继续')
await harness.dispose()
