import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'logs'
export const inject = ['tools']

/** 每段 30 行日志，大约 900 个字符。 */
export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'read_log',
    description: '读取一段服务日志',
    parameters: { part: { type: 'number', required: true } },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute: (args: { part: number }) => Promise.resolve(
      Array.from({ length: 30 }, (_, index) => `[${args.part}-${index}] INFO request ok in ${20 + index % 7}ms`).join('\n'),
    ),
  }))
}
