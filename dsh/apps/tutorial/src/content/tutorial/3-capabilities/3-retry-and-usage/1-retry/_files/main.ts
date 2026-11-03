import * as LlmRetry from '@deepseek-ai/dsh-llm-retry'
import { createHarness } from './harness/index.ts'

const harness = await createHarness({
  script: {
    id: 'flaky',
    rules: [
      // 前两次请求被限流，提供方让我们 200 毫秒后再试（Retry-After）。
      { id: 'busy', match: { lastUserText: '你好' }, respond: { kind: 'error', code: 'RATE_LIMIT', message: '429 请求太多', retryAfterMs: 200 }, maxUses: 2 },
      { id: 'hello', match: { lastUserText: '你好' }, respond: { kind: 'text', chunks: ['你好！'] } },
      // API key 错了：再试多少次也没用。
      { id: 'auth', match: { lastUserText: '在吗' }, respond: { kind: 'error', code: 'AUTH', message: '401 API key 无效' } },
    ],
  },
  show: { requests: false },
})

// TODO：挂上重试插件 LlmRetry，它没有配置。

for (const [session, text] of [['busy', '你好'], ['auth', '在吗']]) {
  await harness.send(text!, session)
  const retries = harness.events(session).filter(event => event.type === 'llm/retry')
  for (const event of retries) {
    const { retry, maxRetries, delayMs, failure } = event.data as { retry: number; maxRetries: number; delayMs: number; failure: { code: string } }
    console.log(`  [${session}] 第 ${retry}/${maxRetries} 次重试，${failure.code}，等 ${delayMs}ms`)
  }
  const attempts = harness.events(session).filter(event => event.type === 'assistant/attempt').length
  console.log(`  [${session}] 失败的请求：${attempts} 次`)
}
await harness.dispose()
