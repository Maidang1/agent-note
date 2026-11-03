import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'scanner'
export const inject = ['tools']

/** 等 ms 毫秒；signal 中止时提前以错误结束。 */
function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('扫描被中止'))
    }, { once: true })
  })
}

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'scan',
    description: 'Scan a directory',
    parameters: { dir: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async (args: { dir: string }, exec) => {
      console.log(`  开始扫描 ${args.dir}`)
      await sleep(300, exec.signal)
      console.log('  扫描跑完了')
      return '找到 120 个文件'
    },
  }))
}
