/**
 * 确定性模型适配器（本项目代码，不是上游）。它是一个上游 LlmAdapter，注册在
 * `scripted` 路由上：上游 agent loop 照常组装并发出请求，它按脚本规则匹配请求
 * 后作答，不回放录好的轨迹。没有规则匹配时，这一轮以错误结束。
 */
import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, LlmError, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'

export const SCRIPTED_PROVIDER = 'scripted'

let streams = 0
/** 脚本适配器被调用的次数。请求被别的 `llm/stream` 监听器拦下时，这个数不变。 */
export const scriptedStreams = () => streams

/** 一条规则：请求满足 match 的全部条件时，用 respond 作答。 */
export interface ScriptRule {
  id: string
  match: {
    /** 最后一条用户消息的文本。 */
    lastUserText?: string
    /** 请求里至少有一条用户消息包含这些片段。 */
    userIncludes?: string[]
    /** system 文本必须包含的片段。 */
    systemIncludes?: string[]
    /** 请求必须声明的工具。 */
    declaredTools?: string[]
    /** 最后一条消息是这段文本的工具结果；`true` 表示任意工具结果。不写时，最后一条消息不能是工具结果。 */
    afterToolResult?: string | true
  }
  respond:
    | { kind: 'text'; chunks: string[] }
    | { kind: 'tool-call'; tool: string; arguments: Record<string, unknown> }
    /** 一次响应里请求多个工具调用。 */
    | { kind: 'tool-calls'; calls: Array<{ tool: string; arguments: Record<string, unknown> }> }
    /** 这次请求失败：抛出带错误码的上游 LlmError，例如 `RATE_LIMIT`；`retryAfterMs` 相当于提供方的 Retry-After。 */
    | { kind: 'error'; code: string; message: string; retryAfterMs?: number }
  /** 这次响应报告的 token 用量，在 finish 之前作为 usage chunk 发出。 */
  usage?: { input: number; output: number }
  maxUses?: number
}

export interface ModelScript {
  id: string
  rules: ScriptRule[]
  /** 模型的上下文窗口（token），压缩等按容量做决定的插件会读到它。不写时不声明容量。 */
  contextWindow?: number
  /** 每次请求默认的输出上限（token）。 */
  maxOutput?: number
}

type Message = GenerateOptions['messages'][number]

/** 消息里的文本块拼接后的文本；工具调用等块不含文本。 */
export function messageText(message: Message | undefined): string {
  const content = (message as { content?: unknown } | undefined)?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.flatMap(block => (block.type === 'text' ? [block.text as string] : [])).join('')
}

export function systemText(request: GenerateOptions): string {
  return request.messages.filter(message => message.role === 'system').map(messageText).join('\n\n')
}

function matches(rule: ScriptRule, request: GenerateOptions): boolean {
  const { match } = rule
  const last = request.messages.at(-1)
  const lastUser = request.messages.findLast(message => message.role === 'user')
  const system = systemText(request)
  if (match.lastUserText !== undefined && messageText(lastUser) !== match.lastUserText) return false
  const users = request.messages.filter(message => message.role === 'user').map(messageText)
  if (match.userIncludes?.some(text => !users.some(user => user.includes(text)))) return false
  if (match.systemIncludes?.some(text => !system.includes(text))) return false
  const declared = new Set((request.tools ?? []).map(tool => tool.name))
  if (match.declaredTools?.some(name => !declared.has(name))) return false
  if (match.afterToolResult !== undefined) return last?.role === 'tool' && (match.afterToolResult === true || messageText(last) === match.afterToolResult)
  return last?.role !== 'tool'
}

export class ScriptedAdapter extends LlmAdapter {
  readonly script: ModelScript
  readonly uses = new Map<string, number>()
  calls = 0

  constructor(script: ModelScript) {
    super()
    this.script = script
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const { contextWindow, maxOutput } = this.script
    return Promise.resolve({
      provider, id: model, name: model,
      ...contextWindow === undefined ? {} : { context: { contextWindow } },
      ...maxOutput === undefined ? {} : { defaultMaxTokens: maxOutput },
    })
  }

  override async* stream(request: GenerateOptions): AsyncIterable<StreamChunk> {
    streams++
    const rule = this.script.rules.find(candidate =>
      (this.uses.get(candidate.id) ?? 0) < (candidate.maxUses ?? Infinity) && matches(candidate, request))
    if (!rule) throw new Error(`模型脚本 "${this.script.id}" 没有规则匹配这次请求`)
    this.uses.set(rule.id, (this.uses.get(rule.id) ?? 0) + 1)
    const { respond } = rule
    if (respond.kind === 'error') {
      throw new LlmError(respond.message, respond.code, respond.retryAfterMs === undefined ? undefined : { providerRetryAfterMs: respond.retryAfterMs })
    }
    const usage = rule.usage ? [{ type: 'usage' as const, usage: { inputTokens: rule.usage.input, outputTokens: rule.usage.output } }] : []
    if (respond.kind === 'tool-call' || respond.kind === 'tool-calls') {
      const calls = respond.kind === 'tool-call' ? [{ tool: respond.tool, arguments: respond.arguments }] : respond.calls
      for (const [index, call] of calls.entries()) {
        const id = ToolCallId(`call-${++this.calls}`)
        const args = JSON.stringify(call.arguments)
        yield { type: 'block-start', index, blockType: 'tool-call' }
        yield { type: 'tool-call-delta', index, id, name: call.tool, argumentsDelta: args }
        yield { type: 'block-end', index, block: { type: 'tool-call', id, name: call.tool, arguments: args } }
      }
      yield* usage
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const text = respond.chunks.join('')
    yield { type: 'block-start', index: 0, blockType: 'text' }
    for (const chunk of respond.chunks) yield { type: 'text-delta', index: 0, text: chunk }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield* usage
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/** 把 ScriptedAdapter 注册到 `ctx.llm` 的插件。 */
export const name = 'llm-scripted'
export const inject = ['llm']

export function apply(ctx: Context, config: { script: ModelScript }) {
  ctx.llm.registerAdapter([SCRIPTED_PROVIDER], new ScriptedAdapter(config.script))
}
