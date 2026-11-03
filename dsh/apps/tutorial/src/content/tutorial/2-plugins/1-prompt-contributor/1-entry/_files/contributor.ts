import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

export const name = 'prompt-contributor'

// TODO：声明依赖 systemPrompt 服务。

export function apply(ctx: Context) {
  console.log('apply 运行了')
  ctx.systemPrompt.section({ name: 'lesson:style', order: 100, text: '回答时使用短句' })
}
