/**
 * 课程运行器：在一个新的 Cordis 根上挂载上游对话内核和确定性模型，再由课程
 * 代码挂上自己的插件、发送消息。内核发生的事情按顺序打印到终端：
 * 模型请求、模型响应、检查点、轮次结束原因，以及（可选）每条会话事件。
 *
 * 同一个根也交给流程图记录器（diagram/），预览面板里的流程图就是从这里画出来的。
 *
 * 运行器只观察，不改变调用顺序和返回值：它在 `llm/stream` 上加了一层监听器，
 * 原样转发每个 chunk。
 */
import { Context } from '@deepseek-ai/cordis'
import type { Fiber, Plugin } from '@deepseek-ai/cordis'
import Llm, { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import Session, { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjection from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, AgentSetup } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import * as scriptedLlm from './scripted-llm.ts'
import { SCRIPTED_PROVIDER, messageText, scriptedStreams, systemText } from './scripted-llm.ts'
import type { ModelScript } from './scripted-llm.ts'
import { block, print } from './print.ts'
import { FIBER_STATES, currentDiagram, draw } from './diagram/recorder.ts'

export type { ModelScript, ScriptRule } from './scripted-llm.ts'
export { block, print } from './print.ts'
export { draw } from './diagram/recorder.ts'
/** 确定性模型适配器插件（本项目代码）：`harness.plugin(scriptedModel, { script })`。 */
export * as scriptedModel from './scripted-llm.ts'

/** 上游 sdk-minimal 组合包里的对话内核，每一项都是 npm 上发布的插件，原样挂载。 */
export const kernel = {
  'llm': Llm,
  'session': Session,
  'session-projection': SessionProjection,
  'system-prompt': SystemPrompt,
  'tools': Tools,
  'agent': AgentRegistry,
  'agent-loop': AgentLoop,
} as const satisfies Record<string, Plugin>

/** 运行器默认的 system-prompt 配置：不加 harness 身份段，只保留一句人设，输出更短。 */
export const DEFAULT_SYSTEM_PROMPT = { includeHarnessIdentity: false, personaPrefix: '你是一个助手' }

export type KernelPlugin = keyof typeof kernel

export interface Show {
  /** `harness.plugin()` 挂载后打印插件状态。默认关闭。 */
  plugins?: boolean
  /** 每次模型请求：system 文本、声明的工具、最后一条消息。默认开启。 */
  requests?: boolean
  /** 每次模型请求里的全部非 system 消息，而不只是最后一条。默认关闭。 */
  messages?: boolean
  /** 每次模型响应。默认开启。 */
  responses?: boolean
  /** 每条会话事件的类型。默认关闭。 */
  events?: boolean
  /** 请求里的每条消息最多打印多少个字符，超出部分用“…”代替。默认不截断。 */
  truncate?: number
}

export interface HarnessOptions {
  /** 要挂载的内核插件，默认全部七个。 */
  kernel?: readonly KernelPlugin[]
  /** 确定性模型的脚本。不写时不挂载模型适配器。 */
  script?: ModelScript
  /** agent 请求使用的路由和模型；默认是确定性模型的 `scripted` 路由，模型名取脚本 id。 */
  model?: { provider: string; model: string }
  /** 传给上游 system-prompt 插件的配置。 */
  systemPrompt?: Record<string, unknown>
  show?: Show
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    'lesson/checkpoint'(name: string, data: Record<string, unknown>): void
  }
}

/** 课程检查点（本项目约定，不是上游 API）：插件在关键位置调用，终端按发生顺序打印。 */
export function checkpoint(ctx: Context, name: string, data: Record<string, unknown> = {}) {
  ctx.emit('lesson/checkpoint', name, data)
  currentDiagram()?.checkpoint(ctx, name, data)
}

export function stateOf(fiber: Fiber): string {
  return FIBER_STATES[fiber.state] ?? `unknown(${fiber.state})`
}

/** 让 Cordis 跑完激活与卸载链，再进行下一步。 */
export async function settle() {
  for (let index = 0; index < 3; index++) await new Promise(resolve => setImmediate(resolve))
}

export interface Harness {
  root: Context
  /** 挂载一个插件并等待激活结算，返回它的 fiber；`fiber.dispose()` 即卸载。 */
  plugin(plugin: Plugin | object, config?: unknown): Promise<Fiber>
  /** 会话对应的 agent，第一次使用时创建。`setup` 在 agent 发布前运行，可以往 agent.ctx 注册东西。 */
  agent(sessionId?: string, setup?: AgentSetup): Promise<Agent>
  /** 从持久化存储恢复会话对应的 agent（需要挂载会话持久化后端），之后 `send()` 接着这个会话说。 */
  resume(sessionId?: string): Promise<Agent>
  /** 向会话发送一条用户消息，等这一轮结束。 */
  send(text: string, sessionId?: string): Promise<void>
  /** 会话日志里的全部事件。 */
  events(sessionId?: string): readonly SessionEvent[]
  /** 等到会话日志满足 `check`（例如后台任务唤醒的那一轮也结束了），再等 agent 空闲。超时报错。 */
  until(check: (events: readonly SessionEvent[]) => boolean, sessionId?: string, timeoutMs?: number): Promise<void>
  dispose(): Promise<void>
}

export async function createHarness(options: HarnessOptions): Promise<Harness> {
  const { script } = options
  const show = { plugins: false, requests: true, messages: false, responses: true, events: false, truncate: Infinity, ...options.show }
  const root = new Context()
  const diagram = draw(root)
  diagram.own(() => observe(root, show))
  diagram.withOrigin('kernel', () => {
    for (const id of options.kernel ?? Object.keys(kernel) as KernelPlugin[]) {
      root.plugin(kernel[id], id === 'system-prompt' ? options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT : {})
    }
  })
  if (script) diagram.withOrigin('harness', () => root.plugin(scriptedLlm, { script }))
  await settle()

  const handles = new Map<string, AgentHandle>()

  const agentOptions = options.model ?? { provider: SCRIPTED_PROVIDER, model: script?.id ?? SCRIPTED_PROVIDER }

  const agent = async (sessionId = 's', setup?: AgentSetup): Promise<Agent> => {
    const existing = handles.get(sessionId)
    if (existing) return existing.agent
    if (!root.get('agentLoop')) throw new Error('agentLoop 服务没有就绪，检查是否缺少它依赖的服务')
    const handle = await root.agents.create({
      sessionId: SessionId(sessionId),
      agentOptions,
      setup: (agentCtx, created) => {
        diagram.nameScope(agentCtx, `agent ${sessionId}`)
        return setup?.(agentCtx, created)
      },
    })
    handles.set(sessionId, handle)
    return handle.agent
  }

  const resume = async (sessionId = 's'): Promise<Agent> => {
    if (handles.has(sessionId)) throw new Error(`会话 ${sessionId} 已经在运行`)
    const handle = await root.agents.resume({
      resumeSessionId: SessionId(sessionId),
      agentOptions,
      setup: (agentCtx) => {
        diagram.nameScope(agentCtx, `agent ${sessionId}`)
      },
    })
    await settle()
    handles.set(sessionId, handle)
    return handle.agent
  }

  return {
    root,
    async plugin(plugin, config) {
      const fiber = root.plugin(plugin as Plugin, config)
      await settle()
      if (show.plugins) printPlugin(fiber)
      return fiber
    },
    agent,
    resume,
    async send(text, sessionId = 's') {
      const target = await agent(sessionId)
      print('user', `[${sessionId}] ${truncate(text, show.truncate)}`)
      diagram.input(sessionId, text)
      target.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
      await target.whenIdle()
      await settle()
      diagram.endTurn()
    },
    events(sessionId = 's') {
      const handle = handles.get(sessionId)
      return handle ? handle.agent.session.snapshotEvents() as readonly SessionEvent[] : []
    },
    async until(check, sessionId = 's', timeoutMs = 5000) {
      const handle = handles.get(sessionId)
      if (!handle) throw new Error(`会话 ${sessionId} 还没有 agent`)
      const session = handle.agent.session
      const satisfied = () => check(session.snapshotEvents() as readonly SessionEvent[])
      if (!satisfied()) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            dispose()
            reject(new Error(`等了 ${timeoutMs} 毫秒，会话 ${sessionId} 的日志仍不满足条件`))
          }, timeoutMs)
          const dispose = diagram.own(() => root.on('session/event', (target) => {
            if (target !== session || !satisfied()) return
            clearTimeout(timer)
            dispose()
            resolve()
          }))
        })
      }
      await handle.agent.whenIdle()
      await settle()
    },
    async dispose() {
      for (const handle of [...handles.values()].reverse()) await handle.dispose()
      handles.clear()
    },
  }
}

/** 子 agent 的会话 id 是 UUID，图上只显示前 8 位。 */
function shortId(id: string): string {
  return /^[0-9a-f]{8}-/.test(id) ? id.slice(0, 8) : id
}

/** 超过 `max` 个字符的部分用“…”代替。 */
function truncate(text: string, max: number): string {
  const chars = [...text]
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text
}

/** `[plugin] tools  等待依赖：systemPrompt` 这样的一行。 */
export function printPlugin(fiber: Fiber) {
  const name = fiber.runtime?.name ?? '(匿名插件)'
  const state = stateOf(fiber)
  const missing = Object.keys(fiber.inject).filter(service => !fiber.parent.get(service))
  print('plugin', name, missing.length && state === 'pending' ? `${state}，等待 ${missing.join('、')}` : state)
}

function observe(root: Context, show: Required<Show>) {
  let requests = 0
  const clip = (text: string) => truncate(text, show.truncate)
  root.on('lesson/checkpoint', (name, data) => print('checkpoint', name, Object.keys(data).length ? data : undefined))

  // 插件通过 ctx.logger 报告的警告和错误。很多插件失败时不抛错，只记一条日志。
  root.logger.exporter({
    colors: 0,
    levels: { default: 2 },
    export: ({ type, name, args }) => {
      if (type !== 'warn' && type !== 'error') return
      const text = (args as unknown[]).map(arg => arg instanceof Error ? arg.message : typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ')
      print(type, name, text)
    },
  })

  // 第一个挂上的 llm/stream 监听器在最外层，每次请求恰好经过它一次。
  root.on('llm/stream', async function* (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) {
    const id = ++requests
    if (show.requests) {
      const tools = (options.tools ?? []).map(tool => tool.name)
      print('request', `#${id}`, tools.length ? `tools: ${tools.join(', ')}` : 'tools: (无)')
      block('system', systemText(options))
      if (show.messages) {
        const lines = options.messages.filter(message => message.role !== 'system').map(message => `${message.role}: ${clip(messageText(message)) || '(无文本)'}`)
        block('messages', lines.join('\n'))
      } else {
        const last = options.messages.at(-1)
        if (last) block(`最后一条消息（${last.role}）`, clip(messageText(last)) || '(无文本)')
      }
    }
    const contents: string[] = []
    const streamsBefore = scriptedStreams()
    try {
      for await (const chunk of next()) {
        if (chunk.type === 'block-end') {
          const content = chunk.block.type === 'tool-call' ? `调用 ${chunk.block.name}(${chunk.block.arguments})` : chunk.block.type === 'text' ? chunk.block.text : chunk.block.type
          contents.push(content)
          if (show.responses) print('response', `#${id}`, content)
        }
        // 适配器缺失等失败不抛错，而是以 kind 为 error 的 finish 结束这次流。
        if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
          const failure = (chunk.reason as { failure?: { message?: string } }).failure
          contents.push(`出错：${failure?.message ?? '未知错误'}`)
        }
        yield chunk
      }
    } catch (error) {
      contents.push(`出错：${error instanceof Error ? error.message : String(error)}`)
      throw error
    } finally {
      // 脚本路由上的请求没有走到脚本适配器，说明被别的监听器（比如回放）拦下作答了。
      const intercepted = options.provider === SCRIPTED_PROVIDER && scriptedStreams() === streamsBefore
      currentDiagram()?.response(id, options.provider, contents, intercepted)
    }
  })

  // 每个 agent 的作用域在图上都有名字，包括子 agent 这类不是运行器创建的。
  root.on('agent/created', ({ agent }) => {
    currentDiagram()?.nameScope(agent.ctx, `agent ${shortId(String(agent.session.id))}`)
  })

  // 不是 harness.send() 开始的轮次（例如子 agent 完成后唤醒父 agent），在图上也记成一轮。
  const woken = new Set<string>()
  root.on('session/event', (session, event) => {
    const id = String(session.id)
    if (event.type === 'turn/start' && currentDiagram()?.wake(id, `agent ${shortId(id)} 被唤醒`)) woken.add(id)
    if (event.type === 'turn/end' && woken.delete(id)) queueMicrotask(() => currentDiagram()?.endTurn())
  })

  root.on('session/event', (session, event) => {
    if (show.events) print('event', event.type)
    if (event.type !== 'turn/end') return
    const reason = (event.data as { reason: { kind: string; error?: { message?: string } } }).reason
    const id = shortId(String(session.id))
    if (reason.kind === 'error') print('error', `[${id}] 轮次以错误结束`, reason.error?.message ?? reason)
    else print('turn', `[${id}] 轮次结束`, reason.kind)
  })
}
