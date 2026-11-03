/**
 * 流程图的数据格式。记录器（recorder.ts）在 Node 里产出，预览页（app.js）在浏览器里读。
 * 图里的每个节点、每条边都来自运行时能读到的事实：fiber、它的 effect 和派发的事件。
 */

/** L0 根作用域，L1 基础服务，L2 能力，L3 扩展，L4 编排。 */
export type Layer = 0 | 1 | 2 | 3 | 4

export interface DiagramNode {
  id: string
  /** 图上显示的名字，例如 `tools`、`calculator`、`agent strict`。 */
  label: string
  /** 插件的 `name`（Cordis 的 runtime name），根节点是 `root`。 */
  plugin: string
  layer: Layer
  kind: 'root' | 'plugin' | 'scope'
  /** 挂在哪个 agent 作用域里；挂在根上为 null。 */
  scope: string | null
  /** Cordis fiber 状态：pending、loading、active、failed、disposed、unloading。 */
  state: string
  provides: string[]
  injects: string[]
  /** inject 里还没有提供者的服务。 */
  missing: string[]
  /** kernel：运行器挂的上游内核；harness：运行器自带的插件；lesson：课程代码挂的。 */
  origin: 'kernel' | 'harness' | 'lesson'
  error?: string
}

export interface DiagramEdge {
  id: string
  /** inject：依赖的服务；register：在服务上注册的东西；listen：监听服务派发的事件。 */
  kind: 'inject' | 'register' | 'listen'
  from: string
  to: string
  label: string
  count: number
}

export interface DiagramGraph {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

/** 数据流里的一步：一次事件派发、一次模型请求或响应、一个检查点。 */
export interface FlowStep {
  /** 所属轮次；不在任何轮次里（例如挂载期间的检查点）为 0。 */
  turn: number
  /** 轮次内从 1 开始的编号。 */
  n: number
  event: string
  label: string
  /** 发出方节点；用户输入为 null。 */
  from: string | null
  /** 接收方节点：事件的监听者、请求的处理者。 */
  to: string[]
  detail?: string
}

export interface Frame {
  kind: 'structure' | 'flow'
  caption: string
  /** 这一帧时的结构图，`Timeline.graphs` 的下标。 */
  graph: number
  step?: FlowStep
}

export interface Turn {
  id: number
  session: string
  input: string
  /** 第一帧和最后一帧的下标；轮次未结束时 end 为 null。 */
  start: number
  end: number | null
}

export interface Timeline {
  version: 1
  graphs: DiagramGraph[]
  frames: Frame[]
  turns: Turn[]
}
