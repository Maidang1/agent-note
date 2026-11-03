import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'calculator'
export const inject = ['tools']

export function apply(ctx: Context) {
  // TODO：用 ctx.tools.register(defineTool({ ... })) 注册一个 add 工具
}
