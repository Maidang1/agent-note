import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

export const name = 'prompt-contributor'
export const inject = ['systemPrompt']

export function apply(ctx: Context) {
  // 从根上拿服务：看起来没什么区别，提示词都是同一个注册表。
  const registry = ctx.root.systemPrompt
  registry.section({ name: 'lesson:style', order: 100, text: '回答时使用短句' })
}
