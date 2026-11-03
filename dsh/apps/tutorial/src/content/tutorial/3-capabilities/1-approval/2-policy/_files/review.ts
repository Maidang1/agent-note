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
    execute: (args: { pr: number; body: string }) => Promise.resolve(`已发布到 PR #${args.pr}：${args.body}`),
  }))

  // 发布评审是对外可见的操作：执行前先问人。
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name === 'post_review') return { kind: 'ask', reason: '发布评审需要人工确认' }
    return next()
  })
}
