import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-system-prompt'

export const name = 'prompt-contributor'
export const inject = ['systemPrompt']

export interface Config {
  name: string
  order: number
  text: string
}

/** Cordis 在 apply 之前按它校验并补全配置。 */
export const Config: z<Config> = z.object({
  name: z.string().default('lesson:style'),
  order: z.number().default(100),
  text: z.string().required(),
})

export function apply(ctx: Context, config: Config) {
  ctx.systemPrompt.section({ name: config.name, order: config.order, text: config.text })
}
