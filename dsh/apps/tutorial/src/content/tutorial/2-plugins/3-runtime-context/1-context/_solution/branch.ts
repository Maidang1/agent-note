import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

export const name = 'git-branch'
export const inject = ['systemPrompt']

/** 假装是从 git 读出来的当前分支，main.ts 会在两轮之间改它。 */
export const state = { current: 'main' }

export function apply(ctx: Context) {
  ctx.systemPrompt.context({ name: 'lesson:branch', order: 100, text: () => `当前分支：${state.current}` })
}
