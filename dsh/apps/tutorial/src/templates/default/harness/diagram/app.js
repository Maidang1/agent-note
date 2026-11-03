// 流程图预览页：从 /events 接收时间线，按回放游标画出那一刻的插件结构和数据流。
import { nodeExplain, stepExplain } from './glossary.js'
import { circled, cornerPath, flowAt, layoutGraph, routeEdges, stops, textWidth } from './layout.js'

const STATE_TEXT = {
  pending: '等待依赖',
  loading: '启动中',
  active: '已激活',
  failed: '失败',
  disposed: '已卸载',
  unloading: '卸载中',
}

const VIEWS = [
  { id: 'flow', label: '数据流', hint: '这一轮里依次发生的事：谁发出、谁接收' },
  { id: 'register', label: '注册', hint: '插件在服务上注册的东西和监听的事件' },
  { id: 'inject', label: '依赖', hint: '插件 inject 的服务，箭头指向提供者' },
]

const state = {
  /** @type {import('./model.ts').Timeline | null} */
  timeline: null,
  /** 步骤面板是否展开；窄的时候默认收起，让出画布。 */
  side: window.innerWidth >= 1100,
  cursor: 0,
  follow: true,
  view: 'flow',
  playing: false,
  speed: 1,
  timer: 0,
  /** 简明模式：合并会话日志步骤、显示大白话说明。默认打开，记在 localStorage 里。 */
  simple: load('diagram-simple') !== 'false',
  /** 点选的节点 id，显示它的说明卡片。 */
  selected: null,
}

function load(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

function save(key, value) {
  try { localStorage.setItem(key, value) } catch { /* 预览可能禁用了存储 */ }
}

const $ = selector => document.querySelector(selector)
const escape = text => String(text).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])

function connect() {
  const source = new EventSource('/events')
  source.onmessage = (event) => {
    const timeline = JSON.parse(event.data)
    const restarted = !state.timeline || !timeline || timeline.frames.length < state.timeline.frames.length
    state.timeline = timeline
    if (!timeline) return render()
    if (restarted) state.follow = true
    if (state.follow) state.cursor = timeline.frames.length - 1
    render()
  }
}

function setCursor(index, { stop = true } = {}) {
  const frames = state.timeline?.frames.length ?? 0
  state.cursor = Math.max(0, Math.min(frames - 1, index))
  state.follow = state.cursor === frames - 1 && !state.playing
  if (stop) pause()
  render()
}

/** 从游标出发，往前（-1）或往后（1）的下一个停靠帧；简明模式跳过合并掉的日志帧。 */
function step(direction) {
  if (!state.timeline) return state.cursor
  const list = stops(state.timeline, state.simple)
  const found = direction > 0 ? list.find(index => index > state.cursor) : list.findLast(index => index < state.cursor)
  return found ?? state.cursor
}

function play() {
  const frames = state.timeline?.frames.length ?? 0
  if (!frames) return
  if (state.cursor >= frames - 1) state.cursor = 0
  state.playing = true
  state.follow = false
  tick()
}

function tick() {
  clearTimeout(state.timer)
  if (!state.playing) return render()
  render()
  const frames = state.timeline.frames.length
  if (state.cursor >= frames - 1) {
    state.playing = false
    state.follow = true
    return render()
  }
  state.timer = setTimeout(() => {
    const next = step(1)
    state.cursor = next === state.cursor ? frames - 1 : next
    tick()
  }, 700 / state.speed)
}

function pause() {
  state.playing = false
  clearTimeout(state.timer)
}

// ---------- 渲染 ----------

function render() {
  const { timeline } = state
  if (!timeline || !timeline.frames.length) {
    $('#canvas').innerHTML = '<p class="empty">等待课程代码运行……</p>'
    $('#side').innerHTML = ''
    $('#bar').hidden = true
    return
  }
  $('#bar').hidden = false
  const frame = timeline.frames[state.cursor]
  const graph = timeline.graphs[frame.graph]
  const previous = state.cursor > 0 ? timeline.graphs[timeline.frames[state.cursor - 1].graph] : null
  const flow = flowAt(timeline, state.cursor, { simple: state.simple })
  renderTabs()
  renderCanvas(graph, previous, flow)
  renderInfo(graph)
  renderSide(timeline, frame, flow)
  renderBar(timeline, frame, flow)
}

function renderTabs() {
  $('#views').innerHTML = VIEWS.map(view => `<button type="button" role="tab" aria-selected="${state.view === view.id}" data-view="${view.id}" title="${escape(view.hint)}">${view.label}</button>`).join('')
  document.body.classList.toggle('side-open', state.side)
  $('#toggle-side').setAttribute('aria-expanded', String(state.side))
  $('#toggle-side').textContent = state.side ? '收起步骤' : '步骤'
  $('#mode').setAttribute('aria-pressed', String(!state.simple))
}

function visibleEdges(graph, flow) {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]))
  const lessonish = edge => nodes.get(edge.from)?.origin === 'lesson' || nodes.get(edge.to)?.origin === 'lesson'
  if (state.view === 'inject') {
    return graph.edges.filter(edge => edge.kind === 'inject').map(edge => ({ ...edge, tone: 'inject', text: edge.label }))
  }
  if (state.view === 'register') {
    return graph.edges.filter(edge => edge.kind !== 'inject').map(edge => ({
      ...edge,
      tone: lessonish(edge) ? 'register-lesson' : 'register',
      text: edge.count > 1 ? `${edge.label} ×${edge.count}` : edge.label,
    }))
  }
  // 数据流视图：课程插件的注册关系做底，上面画这一轮的每一步。
  const base = graph.edges.filter(edge => edge.kind !== 'inject' && lessonish(edge)).map(edge => ({ ...edge, tone: 'faint', text: '' }))
  const steps = flow.edges.map(edge => ({
    ...edge,
    tone: edge.current ? 'current' : 'flown',
    text: edge.primary ? `${circled(edge.n)} ${edge.label}${edge.count > 1 ? ` +${edge.count - 1}` : ''}` : '',
  }))
  return [...base, ...steps]
}

function renderCanvas(graph, previous, flow) {
  const container = $('#canvas')
  const layout = layoutGraph(graph, Math.max(640, container.clientWidth))
  const edges = visibleEdges(graph, flow)
  const routes = routeEdges(layout, edges.map(edge => ({ id: edge.id, from: edge.from, to: edge.to, label: edge.text })))
  const byId = new Map(edges.map(edge => [edge.id, edge]))
  const before = new Map((previous?.nodes ?? []).map(node => [node.id, node]))
  const parts = []
  parts.push(`<svg viewBox="0 0 ${layout.width} ${layout.height}" preserveAspectRatio="xMidYMin meet" role="group" aria-label="${escape(summary(graph))}">`)
  parts.push('<defs>')
  for (const tone of ['inject', 'register', 'register-lesson', 'faint', 'flown', 'current']) {
    parts.push(`<marker id="arrow-${tone}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="arrow arrow-${tone}"/></marker>`)
  }
  parts.push('</defs>')
  for (const band of layout.bands) {
    const count = graph.nodes.filter(node => node.layer === band.layer).length
    parts.push(`<g class="band${band.layer % 2 ? ' band-alt' : ''}"><rect x="0" y="${band.y}" width="${layout.width}" height="${band.h}"/>`)
    parts.push(`<title>L${band.layer} ${escape(band.name)}：${escape(band.caption)}</title>`)
    parts.push(`<text class="band-layer" x="12" y="${band.y + 24}">L${band.layer}</text>`)
    parts.push(`<text class="band-name" x="12" y="${band.y + 41}">${escape(band.name)}</text>`)
    if (!count) parts.push(`<text class="band-empty" x="${(layout.width + 84) / 2}" y="${band.y + band.h / 2 + 4}" text-anchor="middle">${escape(band.caption)} · 这一层还没有插件</text>`)
    parts.push('</g>')
  }
  for (const route of routes) {
    const edge = byId.get(route.id)
    parts.push(`<path class="edge edge-${edge.tone}" d="${cornerPath(route.points)}" marker-end="url(#arrow-${edge.tone})"/>`)
  }
  const labels = new Map(graph.nodes.map(node => [node.id, node.label]))
  for (const rect of layout.nodes.values()) parts.push(nodeSvg(rect, before, previous, labels))
  if (state.view === 'flow') {
    const stacks = new Map()
    for (const badge of [...flow.badges].sort((a, b) => b.n - a.n)) {
      const rect = layout.nodes.get(badge.node)
      if (!rect) continue
      const level = stacks.get(badge.node) ?? 0
      if (level >= 3) continue
      stacks.set(badge.node, level + 1)
      const text = `${circled(badge.n)} ${badge.label}${badge.count > 1 ? ` +${badge.count - 1}` : ''}`
      const w = textWidth(text) + 16
      const cx = Math.max(84 + w / 2, Math.min(layout.width - w / 2 - 4, rect.x + rect.w / 2))
      const below = rect.node.layer === 4 || rect.node.layer === 0
      const y = below ? rect.y + rect.h + 6 + level * 22 : rect.y - 26 - level * 22
      parts.push(`<g class="badge${badge.current ? ' is-current' : ''}"><rect x="${cx - w / 2}" y="${y}" width="${w}" height="20" rx="10"/><text x="${cx}" y="${y + 14}" text-anchor="middle">${escape(text)}</text></g>`)
    }
  }
  for (const route of routes) {
    const edge = byId.get(route.id)
    if (!route.label || !edge.text) continue
    const { x, y, w, h, text } = route.label
    parts.push(`<g class="edge-label edge-label-${edge.tone}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9"/><text x="${x + w / 2}" y="${y + 13}" text-anchor="middle">${escape(text)}</text></g>`)
  }
  parts.push('</svg>')
  container.innerHTML = parts.join('')
}

function summary(graph) {
  const plugins = graph.nodes.filter(node => node.kind !== 'root')
  return `插件结构：${plugins.map(node => `${node.label}（L${node.layer}，${STATE_TEXT[node.state] ?? node.state}）`).join('，') || '只有根'}`
}

function nodeSvg(rect, before, previous, labels) {
  const { node, x, y, w, h } = rect
  const old = before.get(node.id)
  const fresh = previous && (!old || old.state !== node.state)
  const scopeLabel = node.scope ? labels.get(node.scope) ?? node.scope : ''
  let subtitle
  if (node.kind === 'root') subtitle = 'new Context()'
  else if (node.missing.length) subtitle = `等待 ${node.missing.join('、')}`
  else if (node.provides.length) subtitle = `→ 提供 ${node.provides.join('、')}`
  else if (node.kind === 'scope') subtitle = 'agent 作用域'
  else if (scopeLabel) subtitle = `⊂ ${scopeLabel}`
  else if (node.injects.length) subtitle = `← 依赖 ${node.injects.length > 2 ? `${node.injects.length} 个服务` : node.injects.join('、')}`
  else subtitle = '没有依赖'
  const status = STATE_TEXT[node.state] ?? node.state
  const classes = ['node', `node-${node.kind}`, `state-${node.state}`, `origin-${node.origin}`]
  if (fresh) classes.push('is-fresh')
  if (node.missing.length) classes.push('is-missing')
  const tag = node.origin === 'lesson' && node.kind === 'plugin' ? `<g class="tag"><rect x="${x + w - 40}" y="${y - 8}" width="36" height="15" rx="7.5"/><text x="${x + w - 22}" y="${y + 3}" text-anchor="middle">课程</text></g>` : ''
  if (state.selected === node.id) classes.push('is-selected')
  const title = `${node.label}（${node.plugin}）${scopeLabel ? `，在作用域 ${scopeLabel} 里` : ''}：${status}${node.error ? `，${node.error}` : ''}。${nodeExplain(node)}`
  const lines = [clip(node.label, 15), clip(subtitle, 18), `${status}${node.error ? ' · 见终端' : ''}`]
  // 名字和看到的文字一致（axe label-content-name-mismatch），完整说明放在 <title> 里作为描述。
  const name = [...lines, tag ? '课程' : ''].filter(Boolean).join(' ')
  return `<g class="${classes.join(' ')}" data-node="${escape(node.id)}" role="button" tabindex="0" aria-pressed="${state.selected === node.id}" aria-label="${escape(name)}"><title>${escape(title)}</title>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9"/>
    <circle class="dot" cx="${x + w - 11}" cy="${y + 13}" r="4"/>
    <text class="node-title" x="${x + 9}" y="${y + 17}">${escape(lines[0])}</text>
    <text class="node-sub" x="${x + 9}" y="${y + 31}">${escape(lines[1])}</text>
    <text class="node-state" x="${x + 9}" y="${y + 44}">${escape(lines[2])}</text>
    ${tag}</g>`
}

function clip(text, max) {
  return [...text].length > max ? `${[...text].slice(0, max - 1).join('')}…` : text
}

/** 点选节点后的说明卡片。 */
function renderInfo(graph) {
  const info = $('#info')
  const node = graph.nodes.find(item => item.id === state.selected)
  if (!node) {
    info.hidden = true
    return
  }
  const status = STATE_TEXT[node.state] ?? node.state
  const facts = []
  if (node.provides.length) facts.push(`提供：${node.provides.join('、')}`)
  if (node.injects.length) facts.push(`依赖：${node.injects.join('、')}`)
  if (node.missing.length) facts.push(`还在等：${node.missing.join('、')}`)
  info.hidden = false
  info.innerHTML = `<div class="info-head"><strong>${escape(node.label)}</strong><span class="muted">L${node.layer} · ${escape(status)}${node.origin === 'lesson' ? ' · 课程插件' : ''}</span>
    <button type="button" id="close-info" aria-label="关闭说明">×</button></div>
    <p>${escape(nodeExplain(node))}</p>${facts.length ? `<p class="muted">${escape(facts.join('；'))}</p>` : ''}`
}

function renderSide(timeline, frame, flow) {
  const side = $('#side')
  if (flow.turn) {
    const { turn } = flow
    side.innerHTML = `<h2>轮次 ${turn.id} · ${escape(turn.input)}</h2>
      <p class="muted">会话 ${escape(turn.session)} · ${flow.all.length} 步${turn.end === null ? ' · 进行中' : ''}${flow.live ? '' : ' · 已结束'}</p>
      <ol class="steps">${flow.all.map(item => stepItem(item, item === flow.current, item.frame > state.cursor)).join('')}</ol>`
  } else {
    const frames = timeline.frames.map((item, index) => [index, item]).filter(([, item]) => item.kind === 'structure')
    side.innerHTML = `<h2>结构变化</h2>
      <p class="muted">${frame.kind === 'structure' ? '挂载、激活、注册都会改变结构' : '这一步不在任何轮次里'}</p>
      <ol class="steps">${frames.map(([index, item]) => structureItem(index, item, index === state.cursor, index > state.cursor)).join('')}</ol>`
  }
  side.querySelector('.is-current')?.scrollIntoView({ block: 'nearest' })
}

function stepItem(item, current, upcoming) {
  const label = `${circled(item.n)} ${item.label}`
  const types = item.types ? `<span class="types">${escape(item.types.join(' · '))}</span>` : ''
  const explain = state.simple && current ? `<span class="explain">${escape(stepExplain(item))}</span>` : ''
  const detail = current && item.detail ? `<span class="detail">${escape(item.detail)}</span>` : ''
  return `<li><button type="button" data-frame="${item.frame}" class="${current ? 'is-current' : ''}${upcoming ? ' is-upcoming' : ''}"${current ? ' aria-current="step"' : ''}>${escape(label)}${types}${explain}${detail}</button></li>`
}

function structureItem(index, frame, current, upcoming) {
  return `<li><button type="button" data-frame="${index}" class="${current ? 'is-current' : ''}${upcoming ? ' is-upcoming' : ''}"${current ? ' aria-current="step"' : ''}>${escape(frame.caption)}</button></li>`
}

function renderBar(timeline, frame, flow) {
  const total = timeline.frames.length
  $('#play').textContent = state.playing ? '暂停' : '回放'
  $('#play').setAttribute('aria-pressed', String(state.playing))
  const slider = $('#slider')
  slider.max = String(total - 1)
  slider.value = String(state.cursor)
  slider.setAttribute('aria-valuetext', `第 ${state.cursor + 1} 帧，共 ${total} 帧：${frame.caption}`)
  $('#position').textContent = `${state.cursor + 1} / ${total}`
  const current = flow.current
  $('#caption').textContent = current ? `${circled(current.n)} ${current.label}` : frame.caption
  const explain = state.simple && current ? stepExplain(current) : ''
  $('#explain').textContent = explain
  $('#explain').hidden = !explain
  $('#speed').textContent = `${state.speed}×`
  // 可见文字要包含在可访问名称里。
  $('#speed').setAttribute('aria-label', `回放速度 ${state.speed}×`)
}

// ---------- 交互 ----------

document.addEventListener('click', (event) => {
  const node = event.target instanceof Element ? event.target.closest('[data-node]') : null
  if (node) return select(node.getAttribute('data-node'))
  const target = event.target instanceof Element ? event.target.closest('button') : null
  if (!target) return
  if (target.dataset.view) {
    state.view = target.dataset.view
    render()
  } else if (target.dataset.frame) {
    setCursor(Number(target.dataset.frame))
  } else if (target.id === 'play') {
    if (state.playing) {
      pause()
      render()
    } else play()
  } else if (target.id === 'first') setCursor(0)
  else if (target.id === 'prev') setCursor(step(-1))
  else if (target.id === 'next') setCursor(step(1))
  else if (target.id === 'last') setCursor(Infinity)
  else if (target.id === 'toggle-side') {
    state.side = !state.side
    render()
  } else if (target.id === 'mode') {
    state.simple = !state.simple
    save('diagram-simple', String(state.simple))
    render()
  } else if (target.id === 'close-info') {
    select(null)
  } else if (target.id === 'speed') {
    state.speed = state.speed >= 4 ? 1 : state.speed * 2
    render()
  }
})

$('#slider').addEventListener('input', event => setCursor(Number(event.target.value)))

function select(id) {
  state.selected = id === state.selected ? null : id
  render()
  if (id) document.querySelector(`[data-node="${CSS.escape(id)}"]`)?.focus()
}

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return
  const node = event.target instanceof Element ? event.target.closest('[data-node]') : null
  if (node && (event.key === 'Enter' || event.key === ' ')) select(node.getAttribute('data-node'))
  else if (event.key === 'Escape' && state.selected) select(null)
  else if (event.key === 'ArrowLeft') setCursor(step(-1))
  else if (event.key === 'ArrowRight') setCursor(step(1))
  else return
  event.preventDefault()
})

let resizeTimer = 0
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(render, 100)
})

connect()
