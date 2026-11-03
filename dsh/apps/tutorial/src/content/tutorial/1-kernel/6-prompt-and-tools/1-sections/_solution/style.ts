import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

export const name = 'style'
export const inject = ['systemPrompt']

export function apply(ctx: Context) {
  // 片段：名称、顺序、文本。order 越小越靠前，相同时按名称排序。
  ctx.systemPrompt.section({ name: 'lesson:style', order: 100, text: '回答时使用短句' })
  ctx.systemPrompt.section({ name: 'lesson:address', order: 50, text: '称呼用户为{{user}}' })

  // 变量：渲染时插值。提供方按组装上下文求值。
  ctx.systemPrompt.variable('user', () => '小林')
}
