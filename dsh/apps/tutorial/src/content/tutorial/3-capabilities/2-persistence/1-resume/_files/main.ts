import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {} from '@deepseek-ai/dsh-session-persistence'
import * as JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { createHarness } from './harness/index.ts'
import { script, store } from './store.ts'

// 进程一：在子进程里运行 first-run.ts，然后进程结束，内存里的一切都没了。
const root = mkdtempSync(join(tmpdir(), 'dsh-sessions-'))
console.log('--- 第一次运行 ---')
spawnSync(process.execPath, ['first-run.ts'], { stdio: 'inherit', env: { ...process.env, SESSION_ROOT: root } })

// 进程二：一个新的 Cordis 根，挂上同一个目录的持久化后端。
console.log('--- 第二次运行 ---')
const harness = await createHarness({ script, show: { requests: false } })
await harness.plugin(JsonlPersistence, store(root))

const stored = await harness.root.sessionPersistence.list()
console.log('磁盘上的会话：', stored.map(snapshot => snapshot.header.id))

if (stored.some(snapshot => snapshot.header.id === 's')) {
  const file = join(root, '_no-cwd/s', readdirSync(join(root, '_no-cwd/s')).find(name => name.endsWith('.jsonl'))!)
  const types = readFileSync(file, 'utf8').trim().split('\n').slice(1).map(line => JSON.parse(line).type)
  console.log(`日志文件里有 ${types.length} 条事件：`, types.join(' '))
  await harness.resume('s')
}
await harness.send('我叫什么？')
await harness.dispose()
