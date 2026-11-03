import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-tools'
import { checkpoint } from './harness/index.ts'

export const name = 'tool-guard'
export const inject = ['tools']

export interface Config {
  deny: string[]
}

export const Config: z<Config> = z.object({
  deny: z.array(z.string()).default([]),
})

export function apply(ctx: Context, config: Config) {
  const deny = new Set(config.deny)

  ctx.on('tools/pre-execute', async (exec, next) => {
    checkpoint(ctx, 'audit-enter', { tool: exec.name })
    const decision = await next()
    checkpoint(ctx, 'audit-return', { tool: exec.name, decision: decision.kind })
    return decision
  })

  ctx.on('tools/pre-execute', async (exec, next) => {
    checkpoint(ctx, 'policy-enter', { tool: exec.name })
    if (deny.has(exec.name)) return { kind: 'deny', reason: `${exec.name} is blocked by policy` }
    const decision = await next()
    checkpoint(ctx, 'policy-return', { tool: exec.name, decision: decision.kind })
    return decision
  })
}
