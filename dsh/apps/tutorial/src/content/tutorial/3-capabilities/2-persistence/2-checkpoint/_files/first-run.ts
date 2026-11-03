// 第一次运行：由 main.ts 在子进程里启动。工具执行到一半，进程崩溃了。
import * as CheckpointPolicy from '@deepseek-ai/dsh-session-checkpoint-policy'
import * as JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { createHarness } from './harness/index.ts'
import * as review from './review.ts'
import { script, store } from './store.ts'

const harness = await createHarness({ script, show: { requests: false } })
await harness.plugin(JsonlPersistence, store())
// TODO：挂上检查点策略 CheckpointPolicy，它没有配置。

await harness.plugin(review)
await harness.send('给 PR #42 发布评审')
