import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

export const name = 'git-branch'
export const inject = ['systemPrompt']

/** 假装是从 git 读出来的当前分支，main.ts 会在两轮之间改它。 */
export const state = { current: 'main' }

export function apply(ctx: Context) {
  // TODO：分支会变，它不该放进系统提示词。改用 ctx.systemPrompt.context()，参数不变。
  ctx.systemPrompt.section({ name: 'lesson:branch', order: 100, text: () => `当前分支：${state.current}` })
}
