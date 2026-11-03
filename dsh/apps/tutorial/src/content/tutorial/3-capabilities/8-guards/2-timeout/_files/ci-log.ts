import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** 等 ms 毫秒；signal 中止时提前结束并抛错。 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('下载被中止'))
    }, { once: true })
  })
}

export const name = 'ci-log'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'fetch_ci_log',
    description: '下载 PR 的 CI 日志',
    parameters: { pr: { type: 'number', required: true } },
    // 这个工具最多只该跑 300 毫秒。
    timeoutMs: 300,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    // CI 服务器很慢，下载要 2 秒。
    async execute(args: { pr: number }, exec) {
      await sleep(2000, exec.signal)
      return `PR #${args.pr} 的 CI 日志：全部通过`
    },
  }))
}
