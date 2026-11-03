// 流程图布局：纯函数，不碰 DOM，浏览器和单元测试共用。
// 横向条带 L0–L4；节点在条带里排开；边走直角折线，跨层时绕开中间层的节点。

/** @typedef {import('./model.ts').DiagramGraph} DiagramGraph */
/** @typedef {import('./model.ts').DiagramNode} DiagramNode */
/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */
/** @typedef {Rect & { node: DiagramNode }} Placed */
/** @typedef {{ id: string, from: string, to: string, label: string }} EdgeInput */
/** @typedef {{ id: string, points: Array<[number, number]>, label: Rect & { text: string } | null }} Routed */

/** 五层条带：名字、空条带上的说明、高度。 */
export const LAYERS = [
  { layer: 0, name: '根作用域', caption: 'Cordis root', h: 62 },
  { layer: 1, name: '基础服务', caption: '提供服务，不依赖其他服务', h: 104 },
  { layer: 2, name: '能力', caption: '工具运行时 · 模型适配', h: 104 },
  { layer: 3, name: '扩展', caption: '向下层服务贡献内容', h: 104 },
  { layer: 4, name: '编排', caption: 'Agent 主循环', h: 120 },
]

export const NODE_W = 138
export const NODE_H = 50
const GAP = 14
const GUTTER = 84
const RIGHT = 12

/** L1 的固定顺序：依赖它们的 L2 节点大致落在下方，连线少交叉。 */
const L1_ORDER = ['session', 'session-projection', 'agent', 'system-prompt', 'llm']

/** 中文按两个字符宽估算文字宽度。 */
export function textWidth(text, size = 11) {
  let units = 0
  for (const char of text) units += char.charCodeAt(0) > 0x2e80 ? 1.9 : 1
  return units * size * 0.58
}

function overlaps(a, b, margin = 0) {
  return a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin
}

/**
 * 在条带里排开节点：先算每个节点想要的横坐标，再从左到右推开重叠，超出右边界就整体左移。
 * @param {Array<{ id: string, want: number }>} items
 * @param {number} left
 * @param {number} right
 */
function spread(items, left, right) {
  const sorted = [...items].sort((a, b) => a.want - b.want || a.id.localeCompare(b.id))
  const xs = []
  for (const [index, item] of sorted.entries()) {
    const min = index ? xs[index - 1] + NODE_W + GAP : left
    xs.push(Math.max(item.want, min))
  }
  const overflow = (xs.at(-1) ?? 0) + NODE_W - right
  if (overflow > 0) {
    for (let index = xs.length - 1; index >= 0; index--) {
      const max = index === xs.length - 1 ? right - NODE_W : xs[index + 1] - NODE_W - GAP
      xs[index] = Math.max(left, Math.min(xs[index], max))
    }
  }
  return new Map(sorted.map((item, index) => [item.id, xs[index]]))
}

/**
 * @param {DiagramGraph} graph
 * @param {number} minWidth
 */
export function layoutGraph(graph, minWidth = 640) {
  const byLayer = LAYERS.map(({ layer }) => graph.nodes.filter(node => node.layer === layer))
  const widest = Math.max(1, ...byLayer.map(nodes => nodes.length))
  const width = Math.max(minWidth, GUTTER + widest * (NODE_W + GAP) + RIGHT)
  const left = GUTTER
  const right = width - RIGHT
  const bands = []
  let y = 0
  for (const meta of LAYERS) {
    bands.push({ ...meta, y })
    y += meta.h
  }
  /** @type {Map<string, Placed>} */
  const placed = new Map()
  const center = (left + right) / 2
  const provider = new Map()
  for (const node of graph.nodes) for (const service of node.provides) if (!provider.has(service)) provider.set(service, node.id)

  for (const [layer, nodes] of byLayer.entries()) {
    const band = bands[layer]
    // L4 的节点靠上，下面留出数据流标签的位置。
    const top = layer === 4 ? band.y + 12 : band.y + (band.h - NODE_H) / 2
    let wants
    if (layer <= 1) {
      // L0、L1 均匀排开；L1 按固定顺序，课程插件排在后面。
      const rank = node => {
        const index = L1_ORDER.indexOf(node.label)
        return index === -1 ? L1_ORDER.length : index
      }
      const ordered = [...nodes].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id, 'en', { numeric: true }))
      const slot = (right - left) / Math.max(ordered.length, 1)
      wants = ordered.map((node, index) => ({ id: node.id, want: ordered.length === 1 && layer === 0 ? center - NODE_W / 2 : left + slot * (index + 0.5) - NODE_W / 2 }))
    } else {
      // 更下层的节点落在它依赖的服务下方。
      wants = nodes.map((node) => {
        const xs = node.injects.map(service => placed.get(provider.get(service)))
          .filter(Boolean)
          .map(rect => rect.x + NODE_W / 2)
        const want = xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : center
        return { id: node.id, want: want - NODE_W / 2 }
      })
    }
    const xs = spread(wants, left, right)
    for (const node of nodes) placed.set(node.id, { x: xs.get(node.id), y: top, w: NODE_W, h: NODE_H, node })
  }
  return { width, height: y, bands, nodes: placed }
}

/**
 * 给边分配端口和走线。
 * @param {{ bands: Array<{ layer: number, y: number, h: number }>, nodes: Map<string, Placed>, width: number }} layout
 * @param {EdgeInput[]} edges
 * @returns {Routed[]}
 */
export function routeEdges(layout, edges) {
  const { nodes, bands } = layout
  const usable = edges.filter(edge => nodes.has(edge.from) && nodes.has(edge.to) && edge.from !== edge.to)

  // 端口：每个节点的上边和下边各自按另一端的横坐标排序，均匀分布。
  /** @type {Map<string, Array<{ key: string, other: number }>>} */
  const sides = new Map()
  const ends = usable.map((edge) => {
    const a = nodes.get(edge.from)
    const b = nodes.get(edge.to)
    const same = a.node.layer === b.node.layer
    const [lower, upper] = a.node.layer >= b.node.layer ? [a, b] : [b, a]
    const lowerSide = same ? 'bottom' : 'top'
    const ends = { edge, a, b, lower, upper, same, lowerKey: `${lower.node.id}:${lowerSide}`, upperKey: `${upper.node.id}:bottom` }
    for (const [key, other] of [[ends.lowerKey, upper], [ends.upperKey, lower]]) {
      const list = sides.get(key) ?? []
      list.push({ key: edge.id, other: other.x + other.w / 2 })
      sides.set(key, list)
    }
    return ends
  })
  const port = (key, edgeId, rect) => {
    const list = (sides.get(key) ?? []).sort((p, q) => p.other - q.other || p.key.localeCompare(q.key))
    const index = list.findIndex(item => item.key === edgeId)
    const inset = 18
    return rect.x + inset + ((index + 1) / (list.length + 1)) * (rect.w - inset * 2)
  }
  const lane = (key, edgeId) => {
    const list = sides.get(key) ?? []
    return Math.max(0, list.findIndex(item => item.key === edgeId))
  }

  const blocked = (x, fromLayer, toLayer) => [...nodes.values()].some(rect =>
    rect.node.layer > fromLayer && rect.node.layer < toLayer && x > rect.x - 10 && x < rect.x + rect.w + 10)
  const usedChannels = []
  const channel = (want, fromLayer, toLayer) => {
    for (let step = 0; step < 400; step++) {
      for (const x of step ? [want + step * 6, want - step * 6] : [want]) {
        if (x < 40 || x > layout.width - 10) continue
        if (blocked(x, fromLayer, toLayer)) continue
        if (usedChannels.some(used => Math.abs(used - x) < 6)) continue
        usedChannels.push(x)
        return x
      }
    }
    return want
  }

  /** @type {Routed[]} */
  const routed = []
  for (const { edge, a, lower, upper, same, lowerKey, upperKey } of ends) {
    const lx = port(lowerKey, edge.id, lower)
    const ux = port(upperKey, edge.id, upper)
    /** @type {Array<[number, number]>} */
    let points
    if (same) {
      const band = bands[lower.node.layer]
      const y = Math.min(band.y + band.h - 6, lower.y + lower.h + 12 + lane(lowerKey, edge.id) * 6)
      points = [[lx, lower.y + lower.h], [lx, y], [ux, y], [ux, upper.y + upper.h]]
    } else {
      const upperBand = bands[upper.node.layer]
      const cy = Math.min(upperBand.y + upperBand.h - 4, upper.y + upper.h + 12 + lane(upperKey, edge.id) * 6)
      if (lower.node.layer - upper.node.layer === 1 || !blocked(lx, upper.node.layer, lower.node.layer)) {
        points = [[lx, lower.y], [lx, cy], [ux, cy], [ux, upper.y + upper.h]]
      } else {
        const lowerBand = bands[lower.node.layer]
        const ey = Math.max(lowerBand.y + 4, lower.y - 10 - lane(lowerKey, edge.id) * 5)
        const cx = channel((lx + ux) / 2, upper.node.layer, lower.node.layer)
        points = [[lx, lower.y], [lx, ey], [cx, ey], [cx, cy], [ux, cy], [ux, upper.y + upper.h]]
      }
    }
    if (a !== lower) points.reverse()
    routed.push({ id: edge.id, points: dedupe(points), label: null })
  }
  placeLabels(layout, usable, routed)
  return routed
}

function dedupe(points) {
  return points.filter((point, index) => index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1])
}

/** 标签放在折线某一段的中点，避开节点和已经放下的标签；放不下就放在最长的一段上。 */
function placeLabels(layout, edges, routed) {
  const taken = [...layout.nodes.values()].map(({ x, y, w, h }) => ({ x, y, w, h }))
  for (const [index, route] of routed.entries()) {
    const text = edges[index].label
    if (!text) continue
    const w = textWidth(text) + 14
    const h = 18
    const candidates = []
    const segments = route.points.slice(1).map((point, i) => [route.points[i], point])
      .sort((p, q) => length(q) - length(p))
    for (const [p, q] of segments) {
      for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) {
        candidates.push({ x: p[0] + (q[0] - p[0]) * t - w / 2, y: p[1] + (q[1] - p[1]) * t - h / 2, w, h })
      }
    }
    for (const rect of candidates) rect.x = Math.max(GUTTER, Math.min(layout.width - rect.w - 4, rect.x))
    const fit = candidates.find(rect => !taken.some(other => overlaps(rect, other, 2))) ?? candidates[0]
    if (!fit) continue
    taken.push(fit)
    route.label = { ...fit, text }
  }
}

function length([p, q]) {
  return Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1])
}

/** 带圆角的折线路径。 */
export function cornerPath(points, radius = 8) {
  if (points.length < 2) return ''
  let path = `M ${points[0][0]} ${points[0][1]}`
  for (let index = 1; index < points.length - 1; index++) {
    const [px, py] = points[index - 1]
    const [cx, cy] = points[index]
    const [nx, ny] = points[index + 1]
    const inLength = Math.hypot(cx - px, cy - py)
    const outLength = Math.hypot(nx - cx, ny - cy)
    if (!inLength || !outLength) continue
    const r = Math.min(radius, inLength / 2, outLength / 2)
    const ix = cx - ((cx - px) / inLength) * r
    const iy = cy - ((cy - py) / inLength) * r
    const ox = cx + ((nx - cx) / outLength) * r
    const oy = cy + ((ny - cy) / outLength) * r
    path += ` L ${ix} ${iy} Q ${cx} ${cy} ${ox} ${oy}`
  }
  const last = points.at(-1)
  return `${path} L ${last[0]} ${last[1]}`
}

/**
 * @typedef {import('./model.ts').FlowStep & { frame: number, frames: number[], types?: string[] }} TurnStep
 * frame 是这一步第一次出现的帧，frames 是它合并的全部帧。
 */

/**
 * 一轮里的全部步骤，按出现顺序重新编号。简明模式把连续的 `session/event` 合并成一步
 * “写入会话日志”，记下合并了哪些事件类型；中间夹着的结构帧不打断合并。
 * @param {import('./model.ts').Timeline} timeline
 * @param {import('./model.ts').Turn} turn
 * @param {boolean} simple
 * @returns {TurnStep[]}
 */
export function turnSteps(timeline, turn, simple = false) {
  const end = turn.end ?? timeline.frames.length - 1
  /** @type {TurnStep[]} */
  const steps = []
  for (let index = turn.start; index <= end; index++) {
    const step = timeline.frames[index]?.step
    if (!step || step.turn !== turn.id) continue
    const previous = steps.at(-1)
    if (simple && step.event === 'session/event') {
      const type = step.label.split(' · ')[1] ?? step.label
      if (previous?.event === 'log') {
        previous.frames.push(index)
        previous.types?.push(type)
        previous.label = `写入会话日志 ×${previous.frames.length}`
        continue
      }
      steps.push({ ...step, event: 'log', label: '写入会话日志', to: [], frame: index, frames: [index], types: [type] })
      continue
    }
    steps.push({ ...step, frame: index, frames: [index] })
  }
  return steps.map((step, index) => ({ ...step, n: index + 1 }))
}

/**
 * 回放时停下的帧。完整模式每一帧都停；简明模式跳过被合并进“写入会话日志”的后续帧。
 * @param {import('./model.ts').Timeline} timeline
 * @param {boolean} simple
 * @returns {number[]}
 */
export function stops(timeline, simple = false) {
  const skipped = new Set()
  if (simple) {
    for (const turn of timeline.turns) {
      for (const step of turnSteps(timeline, turn, true)) for (const frame of step.frames.slice(1)) skipped.add(frame)
    }
  }
  return timeline.frames.map((_, index) => index).filter(index => !skipped.has(index))
}

/**
 * 时间线上某一帧要画的数据流：这一轮里到这一帧为止的每一步，按发送方和接收方合并。
 * @param {import('./model.ts').Timeline} timeline
 * @param {number} cursor
 * @param {{ simple?: boolean }} options
 */
export function flowAt(timeline, cursor, { simple = false } = {}) {
  const frame = timeline.frames[cursor]
  // 游标在两轮之间时，继续显示最近结束的那一轮。
  const turn = [...timeline.turns].reverse().find(turn => cursor >= turn.start) ?? null
  if (!frame || !turn) return { turn: null, live: false, all: [], steps: [], current: null, edges: [], badges: [] }
  const live = turn.end === null || cursor <= turn.end
  const last = live ? cursor : turn.end
  const all = turnSteps(timeline, turn, simple)
  const steps = all.filter(step => step.frame <= last)
  const current = live ? steps.find(step => step.frames.includes(cursor)) ?? null : null
  /** @type {Map<string, { id: string, from: string, to: string, label: string, n: number, count: number, current: boolean, primary: boolean }>} */
  const edges = new Map()
  /** @type {Map<string, { node: string, event: string, label: string, n: number, count: number, current: boolean }>} */
  const badges = new Map()
  for (const step of steps) {
    const isCurrent = step === current
    if (step.from && step.to.length) {
      for (const [index, to] of step.to.entries()) {
        const id = `flow:${step.from}>${to}`
        const existing = edges.get(id)
        // 一步有多个接收方时，只在第一条边上写标签。
        edges.set(id, { id, from: step.from, to, label: step.label, n: step.n, count: (existing?.count ?? 0) + 1, current: isCurrent, primary: index === 0 })
      }
    } else {
      const node = step.from ?? step.to[0]
      if (!node) continue
      const key = `${node}:${step.event}`
      const existing = badges.get(key)
      badges.set(key, { node, event: step.event, label: step.event === 'log' ? '写入会话日志' : step.label, n: step.n, count: (existing?.count ?? 0) + 1, current: isCurrent })
    }
  }
  return { turn, live, all, steps, current, edges: [...edges.values()], badges: [...badges.values()] }
}

/** 圆圈数字，1–50。 */
export function circled(n) {
  if (n >= 1 && n <= 20) return String.fromCodePoint(0x2460 + n - 1)
  if (n >= 21 && n <= 35) return String.fromCodePoint(0x3251 + n - 21)
  if (n >= 36 && n <= 50) return String.fromCodePoint(0x32b1 + n - 36)
  return `(${n})`
}
