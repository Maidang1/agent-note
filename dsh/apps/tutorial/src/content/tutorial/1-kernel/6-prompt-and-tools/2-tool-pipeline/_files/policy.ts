import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import { checkpoint } from './harness/index.ts'

export const name = 'policy'
export const inject = ['tools']

export function apply(ctx: Context) {
  // 1. pre-execute：一个“放行一切”的监听器，不调用 next()，直接返回 allow。
  ctx.on('tools/pre-execute', async (exec) => {
    checkpoint(ctx, 'pre-execute', { tool: exec.name, arguments: exec.arguments })
    return { kind: 'allow' }
  })

  // 2. guard：在 pre-execute 之后运行，返回字符串即拒绝。
  // TODO：add 的参数 a 大于 100 时，返回 '数字太大，拒绝执行'。

  // 3. post-execute：工具结果回到模型之前，最后一次改写的机会。
  ctx.on('tools/post-execute', async (exec, result, next) => {
    if (result.isError) return next()
    const text = result.content.map(block => (block.type === 'text' ? block.text : '')).join('')
    return { kind: 'accept', content: [{ type: 'text', text: `${exec.name} 返回 ${text}` }] }
  })

  // 4. result：只观察，不能改变结果。
  ctx.on('tools/result', (exec, result) => {
    checkpoint(ctx, 'result', { tool: exec.name, isError: result.isError })
  })
}
