import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import { checkpoint } from './harness/index.ts'

export const name = 'tool-guard'
export const inject = ['tools']

export function apply(ctx: Context) {
  // 审计层：进入时记一笔，把决定交给 next()，返回路上再记一笔。
  ctx.on('tools/pre-execute', async (exec, next) => {
    checkpoint(ctx, 'audit-enter', { tool: exec.name })
    const decision = await next()
    checkpoint(ctx, 'audit-return', { tool: exec.name, decision: decision.kind })
    return decision
  })

  // TODO：照着审计层，再注册一层 policy，检查点叫 policy-enter / policy-return。
}
