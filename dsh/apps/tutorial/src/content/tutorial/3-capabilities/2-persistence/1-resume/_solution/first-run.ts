// 第一次运行：由 main.ts 在一个子进程里启动，说完一句话就退出。
import * as JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { createHarness } from './harness/index.ts'
import { script, store } from './store.ts'

const harness = await createHarness({ script, show: { requests: false } })
await harness.plugin(JsonlPersistence, store())

await harness.send('我叫小林')
await harness.dispose()
