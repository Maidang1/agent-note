import { createHarness, kernel } from './harness/index.ts'

// 一个空的 Cordis 根：不挂任何内核插件，也没有模型。
const harness = await createHarness({ kernel: [], show: { plugins: true } })

// 第一个基础服务：会话日志。
await harness.plugin(kernel['session'])

// TODO：用同样的方式挂上 session-projection、agent、system-prompt、llm
