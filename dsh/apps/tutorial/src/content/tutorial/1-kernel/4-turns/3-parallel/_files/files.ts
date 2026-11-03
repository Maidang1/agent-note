import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'files'
export const inject = ['tools']

/** 每个文件读多久（毫秒）：a.ts 最慢。 */
const DELAY: Record<string, number> = { 'a.ts': 300, 'b.ts': 100, 'c.ts': 100 }

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'read_file',
    description: 'Read a file',
    parameters: { path: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    // TODO：read_file 只读、不改任何状态，声明它可以和同一批调用并行：
    //   isConcurrencySafe: () => true,
    execute: async (args: { path: string }) => {
      console.log(`  开始读 ${args.path}`)
      await new Promise(resolve => setTimeout(resolve, DELAY[args.path] ?? 100))
      console.log(`  读完 ${args.path}`)
      return `${args.path} 的内容`
    },
  }))
}
