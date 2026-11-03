import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

export const name = 'prompt-contributor'
export const inject = ['systemPrompt']

export function apply(ctx: Context) {
  // 通过插件自己的 ctx 注册：片段的 disposer 归这个插件所有。
  ctx.systemPrompt.section({ name: 'lesson:style', order: 100, text: '回答时使用短句' })
}
