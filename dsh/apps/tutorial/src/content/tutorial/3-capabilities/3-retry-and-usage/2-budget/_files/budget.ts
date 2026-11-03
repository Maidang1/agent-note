import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-token-meter'

export const name = 'budget'
// 依赖 tokenMeter：tokenUsage 投影是它注册的。
export const inject = ['agents', 'sessionProjections', 'tokenMeter']

export interface Config {
  /** 一个会话最多用多少 token。 */
  maxTokens: number
}

export function apply(ctx: Context, config: Config) {
  ctx.on('agent/pre-step', async (payload, next) => {
    const usage = ctx.sessionProjections.stateOf(payload.agent.session, 'tokenUsage')
    if (!usage) return next()
    const { totals } = usage
    const used = totals.uncachedInputTokens + totals.cacheReadTokens + totals.cacheWriteTokens + totals.outputTokens
    console.log(`  步骤 ${payload.step} 开始前：已用 ${used} tokens`)
    // TODO：used 超过 config.maxTokens 时返回 { kind: 'reject' }，不再请求模型。
    return next()
  })
}
