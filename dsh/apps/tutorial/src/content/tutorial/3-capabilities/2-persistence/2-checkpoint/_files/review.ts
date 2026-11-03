import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'review'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'post_review',
    description: 'Post a review comment on a pull request',
    parameters: { pr: { type: 'number', required: true }, body: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async (args: { pr: number; body: string }) => {
      console.log(`  评审已经发到 PR #${args.pr}`)
      // 模拟进程在副作用发生之后、结果写回之前崩溃。
      process.exit(1)
    },
  }))
}
