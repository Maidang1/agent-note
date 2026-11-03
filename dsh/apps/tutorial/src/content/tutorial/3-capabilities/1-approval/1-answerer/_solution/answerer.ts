import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-user-approval'

export const name = 'answerer'
export const inject = ['approval']

export function apply(ctx: Context) {
  ctx.on('approval/request', async (request) => {
    console.log(`  审批请求：${request.toolName}，理由：${request.reason}`)
    return 'allowed-once'
  })
}
