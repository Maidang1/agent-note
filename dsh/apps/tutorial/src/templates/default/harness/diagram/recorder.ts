/**
 * 流程图记录器：只读地观察一个 Cordis 根，把插件结构和数据流记成一条时间线。
 *
 * - 结构：每个 fiber 是一个节点；`inject` 画依赖边；fiber 上带标签的 effect
 *   （`tools.register()`、`systemPrompt.section()`、`ctx.on("tools/pre-execute")`……）
 *   画注册边。结构每变一次记一帧。
 * - 数据流：用户输入、事件派发（`internal/dispatch`）、模型请求与响应、课程检查点，
 *   各记一帧。事件的接收方是派发时真正会被调用的监听器。
 *
 * 记录器不改变调用顺序和返回值。它读取的 `events._hooks`、`llm.adapters` 和
 * `reflect._getImpl()` 是上游的内部字段，只读不写。
 */
import { writeFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import type { DiagramEdge, DiagramGraph, DiagramNode, FlowStep, Frame, Layer, Timeline, Turn } from './model.ts'

export type * from './model.ts'

/** Cordis 的 `const enum FiberState` 在构建时被擦除，这里按固定版本源码列出取值。 */
export const FIBER_STATES = ['pending', 'loading', 'active', 'failed', 'disposed', 'unloading'] as const

const STATE_TEXT: Record<string, string> = {
  pending: '等待依赖',
  loading: '启动中',
  active: '已激活',
  failed: '失败',
  disposed: '已卸载',
  unloading: '卸载中',
}

/** 上游内核插件的 runtime name → 图上的名字和层。 */
const KNOWN: Record<string, { label: string; layer: Layer }> = {
  SessionStore: { label: 'session', layer: 1 },
  SessionProjectionRegistry: { label: 'session-projection', layer: 1 },
  AgentRegistry: { label: 'agent', layer: 1 },
  SystemPrompt: { label: 'system-prompt', layer: 1 },
  LlmRuntime: { label: 'llm', layer: 1 },
  ToolRuntime: { label: 'tools', layer: 2 },
  'llm-scripted': { label: 'llm-scripted', layer: 2 },
  AgentLoop: { label: 'agent-loop', layer: 4 },
  ApprovalService: { label: 'user-approval', layer: 2 },
  'session-persistence-jsonl': { label: 'session-persistence-jsonl', layer: 2 },
  'session-persistence-jsonl-service': { label: 'session-persistence', layer: 2 },
  'session-checkpoint-policy': { label: 'session-checkpoint-policy', layer: 3 },
  TokenMeter: { label: 'token-meter', layer: 2 },
  BasicCompactionEngine: { label: 'compaction-basic', layer: 2 },
  LocalFileSystem: { label: 'fs-local', layer: 1 },
  ToolResultPruner: { label: 'tool-result-pruner', layer: 2 },
  LocalSpillStore: { label: 'spill-local', layer: 1 },
  WorkingDirectoryService: { label: 'working-directory', layer: 2 },
  SubagentRuntime: { label: 'subagent', layer: 2 },
  'subagent-spawn-in-process': { label: 'subagent-spawn-in-process', layer: 2 },
  activationOwner: { label: 'activation', layer: 3 },
}

/** 画进数据流的事件。其余事件（例如 `agent/status`）只在注册视图里显示监听关系。 */
const FLOW_EVENTS = new Set([
  'agent/pre-step',
  'agent/request-error',
  'system-prompt/assemble',
  'llm/stream',
  'tools/pre-execute',
  'tools/execute',
  'tools/post-execute',
  'tools/result',
  'approval/request',
  'session/event',
])

/**
 * 不靠监听、靠注册参与的事件：派发时，数据流也指向往这个服务登记过对应内容的插件。
 * 例如组装提示词会读到每个 `section()`，执行工具会调用 `register()` 登记的工具本体。
 */
const CONTRIBUTED: Record<string, { service: string, labels: readonly string[] }> = {
  'system-prompt/assemble': { service: 'systemPrompt', labels: ['section()', 'context()', 'variable()', 'tools()'] },
  'tools/execute': { service: 'tools', labels: ['register()'] },
}

/** 事件由哪个服务派发。上游事件名的前缀和服务一一对应。 */
export function eventSource(event: string): string | undefined {
  if (event === 'agent/created' || event === 'agent/disposed') return 'agents'
  if (event.startsWith('agent/')) return 'agentLoop'
  if (event.startsWith('tools/')) return 'tools'
  if (event.startsWith('llm/')) return 'llm'
  if (event.startsWith('system-prompt/')) return 'systemPrompt'
  if (event.startsWith('session/')) return 'sessions'
  if (event.startsWith('approval/')) return 'approval'
  return undefined
}

interface EffectMeta {
  label: string
  children: EffectMeta[]
}

interface Hook {
  ctx: Context
  global?: boolean
}

interface Impl {
  fiber: Fiber
}

/** 上游内部字段的只读视图。 */
const hooksOf = (root: Context): Record<string, Hook[]> => (root.events as unknown as { _hooks: Record<string, Hook[]> })._hooks
const implOf = (ctx: Context, service: string): Impl | undefined =>
  (ctx.reflect as unknown as { _getImpl(name: string, strict: boolean): Impl | undefined })._getImpl(service, false)

const isNamed = (fiber: Fiber) => Boolean(fiber.runtime?.name)

function effectLabels(effects: readonly EffectMeta[], skip: ReadonlySet<unknown>, out: string[] = []): string[] {
  for (const effect of effects) {
    if (skip.has(effect) || effect.label === 'ctx.plugin()') continue
    out.push(effect.label)
    effectLabels(effect.children ?? [], skip, out)
  }
  return out
}

/** `ctx.provide("x")`、`ctx.on("x")`、`service.method(arg)` 三种 effect 标签。 */
type ParsedLabel =
  | { kind: 'provide'; name: string }
  | { kind: 'on'; name: string }
  | { kind: 'call'; service: string; method: string; arg: string }

function parseLabel(label: string): ParsedLabel | undefined {
  const ctx = /^ctx\.(provide|on)\("(.+)"\)$/.exec(label)
  if (ctx) return ctx[1] === 'provide' ? { kind: 'provide', name: ctx[2]! } : { kind: 'on', name: ctx[2]! }
  const call = /^(\w+)\.(\w+)\((.*)\)$/.exec(label)
  if (call && call[1] !== 'ctx') return { kind: 'call', service: call[1]!, method: call[2]!, arg: call[3]! }
  return undefined
}

type Message = { role?: string; content?: unknown }

function messageText(message: Message | undefined): string {
  const content = message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.flatMap((block: { type?: string; text?: string; name?: string; arguments?: string }) =>
    block.type === 'text' ? [block.text ?? ''] : block.type === 'tool-call' ? [`[调用 ${block.name}(${block.arguments})]`] : []).join('')
}

/** 模型请求的要点：system 文本、声明的工具、最后一条消息。 */
function requestDetail(options: unknown): string | undefined {
  const request = options as { messages?: Message[]; tools?: Array<{ name: string }> } | undefined
  if (!request?.messages) return undefined
  const system = request.messages.filter(message => message.role === 'system').map(messageText).join('\n\n')
  const last = request.messages.at(-1)
  const tools = (request.tools ?? []).map(tool => tool.name)
  return [
    `system：\n${system || '(空)'}`,
    `tools：${tools.length ? tools.join(', ') : '(无)'}`,
    last ? `最后一条消息（${last.role}）：\n${messageText(last) || '(无文本)'}` : '',
  ].filter(Boolean).join('\n\n')
}

function describe(previous: DiagramGraph | undefined, next: DiagramGraph): string {
  if (!previous) return next.nodes.length > 1 ? `已有 ${next.nodes.length - 1} 个插件` : '空的 Cordis 根'
  const label = new Map(next.nodes.map(node => [node.id, node.label]))
  const before = new Map(previous.nodes.map(node => [node.id, node]))
  const changes: string[] = []
  for (const node of next.nodes) {
    const old = before.get(node.id)
    if (!old) changes.push(`挂载 ${node.label}`)
    else if (old.state !== node.state) changes.push(`${node.label}：${STATE_TEXT[old.state] ?? old.state} → ${STATE_TEXT[node.state] ?? node.state}`)
  }
  const edgeText = (edge: DiagramEdge) => `${label.get(edge.from) ?? edge.from} → ${label.get(edge.to) ?? edge.to}：${edge.label}`
  const oldEdges = new Map(previous.edges.map(edge => [edge.id, edge]))
  const newEdges = new Set(next.edges.map(edge => edge.id))
  for (const edge of next.edges) {
    const old = oldEdges.get(edge.id)
    if (!old) changes.push(edgeText(edge))
    else if (old.count !== edge.count) changes.push(`${edgeText(edge)} ×${old.count} → ×${edge.count}`)
  }
  for (const edge of oldEdges.values()) if (!newEdges.has(edge.id)) changes.push(`撤销 ${edgeText(edge)}`)
  if (!changes.length) return '结构变化'
  return changes.length > 2 ? `${changes.slice(0, 2).join('；')} 等 ${changes.length} 处变化` : changes.join('；')
}

export class DiagramRecorder {
  readonly timeline: Timeline = { version: 1, graphs: [], frames: [], turns: [] }

  private readonly ids = new WeakMap<Fiber, string>()
  private readonly fibers: Fiber[] = []
  private readonly origins = new WeakMap<Fiber, DiagramNode['origin']>()
  private readonly layers = new WeakMap<Fiber, Layer>()
  private readonly scopeLabels = new WeakMap<Fiber, string>()
  private readonly scopeContexts = new WeakMap<Fiber, Context>()
  private readonly adapterOwners = new Map<string, Fiber>()
  private adapterCounts = new Map<Fiber, number>()
  /** 记录器和运行器自己的监听器，不画进图里。 */
  private readonly ownHooks = new Set<unknown>()
  private readonly ownEffects = new Set<unknown>()
  private origin: DiagramNode['origin'] = 'lesson'
  private lastJson = ''
  private scheduled = false
  private turn: Turn | null = null
  private steps = 0
  private requests = 0
  /** 请求编号 → 除 llm 之外监听这次 `llm/stream` 的节点，用来认出拦下请求作答的插件。 */
  private interceptors = new Map<number, string>()
  private readonly subscribers = new Set<() => void>()

  readonly root: Context

  constructor(root: Context) {
    this.root = root
    for (const runtime of root.registry.values()) for (const fiber of runtime.fibers) this.track(fiber)
    this.own(() => {
      root.on('internal/plugin', (fiber) => {
        this.track(fiber)
        this.schedule()
      })
      root.on('internal/status', () => this.schedule())
      root.on('internal/service', () => this.schedule())
      root.on('internal/listener', () => {
        this.schedule()
      })
      root.on('internal/dispatch', (_mode, name, args, thisArg) => this.dispatched(name, args, thisArg))
    })
    this.sample()
  }

  /** 运行 `register`，其间在根上注册的监听器算作运行器自己的，不画进图里。 */
  own<T>(register: () => T): T {
    const effects = new Set(this.root.fiber.getEffects())
    const hooks = new Set(Object.values(hooksOf(this.root)).flat())
    try {
      return register()
    } finally {
      for (const effect of this.root.fiber.getEffects()) if (!effects.has(effect)) this.ownEffects.add(effect)
      for (const hook of Object.values(hooksOf(this.root)).flat()) if (!hooks.has(hook)) this.ownHooks.add(hook)
    }
  }

  /** 在 `mount` 里同步挂载的插件标成 `origin`。 */
  withOrigin<T>(origin: DiagramNode['origin'], mount: () => T): T {
    const previous = this.origin
    this.origin = origin
    try {
      return mount()
    } finally {
      this.origin = previous
    }
  }

  /** 给 agent 作用域的 fiber 起个名字，例如 `agent strict`。 */
  nameScope(ctx: Context, label: string) {
    this.scopeLabels.set(ctx.fiber, label)
    this.scopeContexts.set(ctx.fiber, ctx)
    this.schedule()
  }

  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener)
    return () => this.subscribers.delete(listener)
  }

  // ---------- 数据流 ----------

  input(session: string, text: string) {
    this.sample()
    this.turn = { id: this.timeline.turns.length + 1, session, input: text, start: this.timeline.frames.length, end: null }
    this.timeline.turns.push(this.turn)
    this.steps = 0
    const short = [...text].length > 24 ? `${[...text].slice(0, 23).join('')}…` : text
    this.step({ event: 'input', label: `用户输入「${short}」`, from: null, to: this.providerNodes('agentLoop'), ...short === text ? {} : { detail: text } })
  }

  /** 不是由用户输入开始的一轮（例如子 agent 的完成通知唤醒了父 agent）。已经有一轮在进行时不处理，返回 false。 */
  wake(session: string, reason: string): boolean {
    if (this.turn) return false
    this.sample()
    this.turn = { id: this.timeline.turns.length + 1, session, input: reason, start: this.timeline.frames.length, end: null }
    this.timeline.turns.push(this.turn)
    this.steps = 0
    this.step({ event: 'wake', label: reason, from: null, to: this.providerNodes('agentLoop') })
    return true
  }

  endTurn() {
    if (!this.turn) return
    this.sample()
    this.turn.end = this.timeline.frames.length - 1
    this.turn = null
    this.steps = 0
    this.notify()
  }

  checkpoint(ctx: Context, name: string, data: Record<string, unknown>) {
    const detail = Object.keys(data).length ? JSON.stringify(data) : undefined
    this.step({ event: 'checkpoint', label: `检查点 ${name}`, from: this.nodeOf(ctx.fiber), to: [], ...detail ? { detail } : {} })
  }

  /** 模型响应：由处理这次请求的适配器发回给 llm；`intercepted` 时由拦下请求的 `llm/stream` 监听器发回。 */
  response(id: number, provider: string, contents: string[], intercepted = false) {
    this.resolveAdapters()
    const owner = this.adapterOwners.get(provider)
    const interceptor = intercepted ? this.interceptors.get(id) : undefined
    this.interceptors.delete(id)
    const from = interceptor ?? (owner ? this.nodeOf(owner) : this.providerNodes('llm')[0] ?? null)
    const summary = contents.join('；') || '(无内容)'
    const short = [...summary].length > 24 ? `${[...summary].slice(0, 23).join('')}…` : summary
    this.step({ event: 'llm/response', label: `响应 #${id} · ${short}`, from, to: this.providerNodes('llm').filter(node => node !== from), detail: contents.join('\n') || '(无内容)' })
  }

  private dispatched(name: string, args: unknown[], thisArg: unknown) {
    if (name === 'llm/adapters-updated') queueMicrotask(() => this.resolveAdapters())
    if (!FLOW_EVENTS.has(name)) return
    const source = eventSource(name)
    const from = source ? this.providerNodes(source)[0] ?? null : null
    const filter = (thisArg as { [Context.filter]?: (ctx: Context) => boolean } | null)?.[Context.filter]
    const listeners = (hooksOf(this.root)[name] ?? [])
      .filter(hook => !this.ownHooks.has(hook) && (hook.global || !filter || filter.call(thisArg, hook.ctx)))
      .map(hook => this.nodeOf(hook.ctx.fiber))
    const to = [...new Set([...listeners, ...this.contributors(name, thisArg, filter)])]
      .filter((node): node is string => node !== null && node !== from)
    if (name === 'llm/stream') {
      const id = ++this.requests
      const interceptor = to.find(node => !this.providerNodes('llm').includes(node))
      if (interceptor) this.interceptors.set(id, interceptor)
      this.step({ event: name, label: `请求 #${id}`, from: this.providerNodes('agentLoop')[0] ?? null, to: [...new Set([...this.providerNodes('llm'), ...to])], detail: requestDetail(args[0]) ?? '' })
      return
    }
    const subject = args[0] as { name?: unknown; type?: unknown; toolName?: unknown } | undefined
    const event = args[1] as { type?: unknown } | undefined
    let label = name
    if (name === 'session/event' && typeof event?.type === 'string') label = `${name} · ${event.type}`
    else if (name.startsWith('tools/') && typeof subject?.name === 'string') label = `${name} · ${subject.name}`
    else if (name === 'approval/request' && typeof subject?.toolName === 'string') label = `${name} · ${subject.toolName}`
    this.step({ event: name, label, from, to })
  }

  /** 往派发服务登记过内容的插件。agent 作用域里的登记只在派发对象是这个 agent 时算数。 */
  private contributors(name: string, thisArg: unknown, filter: ((ctx: Context) => boolean) | undefined): string[] {
    const spec = CONTRIBUTED[name]
    const target = spec && this.providerNodes(spec.service)[0]
    if (!spec || !target) return []
    const graph = this.timeline.graphs[this.sample()]!
    return graph.edges
      .filter(edge => edge.kind === 'register' && edge.to === target && spec.labels.includes(edge.label))
      .map(edge => edge.from)
      .filter(id => {
        const fiber = this.fibers.find(candidate => this.ids.get(candidate) === id)
        if (!fiber || !this.isScope(fiber)) return true
        const scoped = this.scopeContexts.get(fiber)
        return !!scoped && !!filter && filter.call(thisArg, scoped)
      })
  }

  private step(step: Omit<FlowStep, 'turn' | 'n'>) {
    const graph = this.sample()
    const full: FlowStep = { turn: this.turn?.id ?? 0, n: this.turn ? ++this.steps : 0, ...step }
    this.push({ kind: 'flow', caption: step.label, graph, step: full })
  }

  // ---------- 结构 ----------

  private track(fiber: Fiber) {
    if (this.ids.has(fiber)) return
    this.ids.set(fiber, fiber.runtime ? `p${this.fibers.length + 1}` : 'root')
    this.origins.set(fiber, this.origin)
    if (fiber.runtime) this.fibers.push(fiber)
  }

  /** 节点 id：匿名的内部 fiber 归到最近的具名祖先，根 fiber 是 `root`。 */
  private nodeOf(fiber: Fiber | undefined): string | null {
    let current = fiber
    while (current && current.runtime && !isNamed(current)) current = current.parent.fiber
    if (!current) return null
    if (!current.runtime) return 'root'
    this.track(current)
    return this.ids.get(current)!
  }

  private providerNodes(service: string, ctx: Context = this.root): string[] {
    const impl = implOf(ctx, service)
    const node = impl ? this.nodeOf(impl.fiber) : null
    return node ? [node] : []
  }

  private isScope(fiber: Fiber) {
    return fiber.runtime?.name === 'scope' && fiber.parent.fiber.runtime?.name === 'AgentLoop'
  }

  private scopeOf(fiber: Fiber): string | null {
    for (let current = fiber.parent.fiber; current.runtime; current = current.parent.fiber) {
      if (this.isScope(current)) return this.ids.get(current) ?? null
    }
    return null
  }

  private labels(fiber: Fiber): string[] {
    return effectLabels(fiber.getEffects() as EffectMeta[], this.ownEffects)
  }

  private node(fiber: Fiber): DiagramNode {
    const name = fiber.runtime!.name!
    const known = KNOWN[name]
    const scope = this.isScope(fiber)
    const labels = this.labels(fiber)
    const provides = labels.flatMap((label) => {
      const parsed = parseLabel(label)
      return parsed?.kind === 'provide' ? [parsed.name] : []
    })
    const injects = Object.keys(fiber.inject)
    const state = fiber.uid === null ? 'disposed' : FIBER_STATES[fiber.state] ?? String(fiber.state)
    const missing = state === 'disposed' ? [] : injects.filter(service => !fiber.parent.get(service))
    const error = (fiber as unknown as { _error?: unknown })._error
    return {
      id: this.ids.get(fiber)!,
      label: known?.label ?? this.scopeLabels.get(fiber) ?? name,
      plugin: name,
      layer: this.layerOf(fiber, known?.layer ?? (scope ? 3 : undefined), provides, injects, state),
      kind: scope ? 'scope' : 'plugin',
      scope: this.scopeOf(fiber),
      state,
      provides,
      injects,
      missing,
      // agent 作用域由运行器的 harness.agent() 创建。
      origin: scope ? 'harness' : this.origins.get(fiber) ?? 'lesson',
      ...error instanceof Error ? { error: error.message } : error ? { error: String(error) } : {},
    }
  }

  /**
   * 已知插件用固定的层；课程插件按它做什么分层：提供服务、不依赖别的服务是 L1，
   * 提供服务又依赖别的服务是 L2，只依赖 llm（模型适配）也是 L2，其余是 L3 扩展。
   * 激活后定下来，卸载后不再移动。
   */
  private layerOf(fiber: Fiber, fixed: Layer | undefined, provides: string[], injects: string[], state: string): Layer {
    if (fixed !== undefined) return fixed
    const settled = this.layers.get(fiber)
    if (settled !== undefined) return settled
    const layer: Layer = provides.length ? (injects.length ? 2 : 1) : injects.length && injects.every(service => service === 'llm') ? 2 : 3
    if (state === 'active') this.layers.set(fiber, layer)
    return layer
  }

  private edges(fiber: Fiber, from: string, edges: Map<string, DiagramEdge>) {
    const add = (kind: DiagramEdge['kind'], to: string | undefined, label: string) => {
      if (!to || to === from) return
      const id = `${kind}:${from}>${to}:${label}`
      const existing = edges.get(id)
      if (existing) existing.count++
      else edges.set(id, { id, kind, from, to, label, count: 1 })
    }
    if (fiber.runtime && fiber.uid !== null) {
      for (const service of Object.keys(fiber.inject)) {
        const impl = implOf(fiber.parent, service)
        add('inject', impl ? this.nodeOf(impl.fiber) ?? undefined : undefined, service)
      }
    }
    for (const label of this.labels(fiber)) {
      const parsed = parseLabel(label)
      if (!parsed || parsed.kind === 'provide') continue
      if (parsed.kind === 'on') {
        if (parsed.name.startsWith('internal/')) continue
        const source = eventSource(parsed.name)
        if (source) add('listen', this.providerNodes(source, fiber.ctx)[0], `on ${parsed.name}`)
        continue
      }
      add('register', this.providerNodes(parsed.service, fiber.ctx)[0], `${parsed.method}(${parsed.arg})`)
    }
  }

  private build(): DiagramGraph {
    const rootNode: DiagramNode = {
      id: 'root', label: 'root', plugin: 'root', layer: 0, kind: 'root', scope: null, state: 'active',
      provides: [], injects: [], missing: [], origin: 'kernel',
    }
    const nodes = [rootNode]
    const edges = new Map<string, DiagramEdge>()
    this.edges(this.root.fiber, 'root', edges)
    for (const fiber of this.fibers) {
      if (isNamed(fiber)) {
        nodes.push(this.node(fiber))
        this.edges(fiber, this.ids.get(fiber)!, edges)
      } else if (fiber.uid !== null) {
        // 匿名的内部 fiber（例如 `ctx.inject()` 里的登记）算在最近的具名祖先上。
        const owner = this.nodeOf(fiber)
        if (owner && owner !== 'root') this.edges(fiber, owner, edges)
      }
    }
    return { nodes, edges: [...edges.values()] }
  }

  private schedule() {
    if (this.scheduled) return
    this.scheduled = true
    queueMicrotask(() => {
      this.scheduled = false
      this.sample()
    })
  }

  /** 重新读取结构，有变化时记一帧。返回当前结构图的下标。 */
  private sample(): number {
    const graph = this.build()
    const json = JSON.stringify(graph)
    const { graphs } = this.timeline
    if (json === this.lastJson) return graphs.length - 1
    const previous = graphs.at(-1)
    this.lastJson = json
    graphs.push(graph)
    this.push({ kind: 'structure', caption: describe(previous, graph), graph: graphs.length - 1 })
    return graphs.length - 1
  }

  private push(frame: Frame) {
    this.timeline.frames.push(frame)
    this.notify()
  }

  private notify() {
    for (const subscriber of this.subscribers) subscriber()
  }

  /** 适配器的路由归属：`llm/adapters-updated` 之后，`llm.registerAdapter()` 变多的那个 fiber 注册了新路由。 */
  private resolveAdapters() {
    const adapters = (this.root.get('llm') as { adapters?: Map<string, unknown> } | undefined)?.adapters
    if (!adapters) return
    const counts = new Map<Fiber, number>()
    for (const fiber of this.fibers) {
      if (fiber.uid === null) continue
      counts.set(fiber, this.labels(fiber).filter(label => label === 'llm.registerAdapter()').length)
    }
    const grown = [...counts].filter(([fiber, count]) => count > (this.adapterCounts.get(fiber) ?? 0)).map(([fiber]) => fiber)
    this.adapterCounts = counts
    for (const provider of this.adapterOwners.keys()) if (!adapters.has(provider)) this.adapterOwners.delete(provider)
    for (const provider of adapters.keys()) {
      if (!this.adapterOwners.has(provider) && grown.length === 1) this.adapterOwners.set(provider, grown[0]!)
    }
  }
}

let current: DiagramRecorder | undefined
const watchers = new Set<(recorder: DiagramRecorder) => void>()

/** 当前进程里正在记录的流程图。 */
export function currentDiagram(): DiagramRecorder | undefined {
  return current
}

/** 有新的根交给流程图时通知（预览服务器用它切换数据源）。 */
export function onDiagram(watcher: (recorder: DiagramRecorder) => void): () => void {
  watchers.add(watcher)
  if (current) watcher(current)
  return () => watchers.delete(watcher)
}

/** 把一个 Cordis 根交给流程图。同一个根只记录一次。 */
export function draw(root: Context): DiagramRecorder {
  if (current?.root === root) return current
  current = new DiagramRecorder(root)
  for (const watcher of watchers) watcher(current)
  return current
}

// 测试用：进程退出时把时间线写到文件里。
const out = process.env.LESSON_DIAGRAM_OUT
if (out) process.on('exit', () => writeFileSync(out, JSON.stringify(current?.timeline ?? null)))
