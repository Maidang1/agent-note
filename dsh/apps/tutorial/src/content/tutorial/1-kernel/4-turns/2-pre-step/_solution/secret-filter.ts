import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { messageText } from './harness/scripted-llm.ts'

export const name = 'secret-filter'
export const inject = ['agents']

export function apply(ctx: Context) {
  ctx.on('agent/pre-step', async (payload, next) => {
    const texts = payload.messages.map(message => messageText(message))
    console.log(`  pre-step 轮次 ${payload.turn} 步骤 ${payload.step}：`, texts)
    if (texts.some(text => text.includes('密码'))) return { kind: 'reject' }
    return next()
  })
}
