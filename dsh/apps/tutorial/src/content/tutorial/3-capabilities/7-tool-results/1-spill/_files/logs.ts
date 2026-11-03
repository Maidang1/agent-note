import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** 300 行服务日志，中间藏着一行 ERROR。 */
export const lines = Array.from({ length: 300 }, (_, index) => {
  const time = `12:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}`
  return index === 217 ? `${time} ERROR db.query timeout after 30s` : `${time} INFO request ok in ${20 + index % 7}ms`
})

export const name = 'logs'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'read_log',
    description: '读取服务日志',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute: () => Promise.resolve(lines.join('\n')),
  }))
}
