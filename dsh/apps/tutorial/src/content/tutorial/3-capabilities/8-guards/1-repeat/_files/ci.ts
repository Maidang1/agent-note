import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'ci'
export const inject = ['tools']

/** CI 一直没跑完，每次查都是 pending。 */
export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'check_ci',
    description: '查询 PR 的 CI 状态',
    parameters: { pr: { type: 'number', required: true } },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute: () => Promise.resolve('pending'),
  }))
}
