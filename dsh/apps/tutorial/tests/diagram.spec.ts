/**
 * 流程图布局与回放：用最后一课答案的真实时间线，检查每一帧的布局都不重叠、不出界，
 * 以及回放游标在一轮之内和两轮之间看到的数据流。
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { runLesson } from '../scripts/lesson-runner.ts'
import { nodeExplain, stepExplain } from '../src/templates/default/harness/diagram/glossary.js'
import { flowAt, layoutGraph, routeEdges, stops, turnSteps } from '../src/templates/default/harness/diagram/layout.js'
import type { DiagramGraph, Timeline } from '../src/templates/default/harness/diagram/model.ts'

let timeline: Timeline

beforeAll(async () => {
  const output = await runLesson('2-plugins/4-full-picture/1-all-together', 'solution')
  expect(output.code, output.stderr).toBe(0)
  timeline = output.diagram!
}, 60_000)

interface Box { x: number, y: number, w: number, h: number }

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

function edgesOf(graph: DiagramGraph) {
  return graph.edges.map(edge => ({ id: edge.id, from: edge.from, to: edge.to, label: edge.label }))
}

describe('layoutGraph', () => {
  it('每一帧的节点都在自己的条带里，互不重叠，也不超出画布', () => {
    for (const graph of timeline.graphs) {
      const layout = layoutGraph(graph)
      const placed = [...layout.nodes.values()]
      expect(placed).toHaveLength(graph.nodes.length)
      for (const rect of placed) {
        const band = layout.bands[rect.node.layer]!
        expect(rect.y).toBeGreaterThanOrEqual(band.y)
        expect(rect.y + rect.h).toBeLessThanOrEqual(band.y + band.h)
        expect(rect.x).toBeGreaterThanOrEqual(0)
        expect(rect.x + rect.w).toBeLessThanOrEqual(layout.width)
      }
      for (const [index, a] of placed.entries()) {
        for (const b of placed.slice(index + 1)) expect(overlaps(a, b), `${a.node.label} 和 ${b.node.label} 重叠`).toBe(false)
      }
    }
  })

  it('完整的图里五层都有节点', () => {
    const layers = new Set(timeline.graphs.at(-1)!.nodes.map(node => node.layer))
    expect([...layers].sort()).toEqual([0, 1, 2, 3, 4])
  })
})

describe('routeEdges', () => {
  it('每条边都从起点走到终点，标签留在画布里', () => {
    const graph = timeline.graphs.at(-1)!
    const layout = layoutGraph(graph)
    const routed = routeEdges(layout, edgesOf(graph))
    expect(routed.length).toBeGreaterThan(0)
    for (const route of routed) {
      expect(route.points.length).toBeGreaterThanOrEqual(2)
      if (route.label) {
        expect(route.label.x).toBeGreaterThanOrEqual(0)
        expect(route.label.x + route.label.w).toBeLessThanOrEqual(layout.width)
      }
    }
  })
})

describe('flowAt', () => {
  it('第一轮开始之前没有数据流', () => {
    const turn = timeline.turns[0]!
    const flow = flowAt(timeline, turn.start - 1)
    expect(flow.turn).toBeNull()
    expect(flow.edges).toEqual([])
  })

  it('游标在一轮之内时，只累积到游标为止的步骤', () => {
    const turn = timeline.turns[0]!
    const request = timeline.frames.findIndex(frame => frame.step?.label === '请求 #1')
    const flow = flowAt(timeline, request)
    expect(flow.live).toBe(true)
    expect(flow.steps.at(-1)!.label).toBe('请求 #1')
    expect(flow.steps.every(step => step.turn === turn.id)).toBe(true)
    expect(flow.edges.filter(edge => edge.current).map(edge => edge.label)).toEqual(['请求 #1'])
    expect(flow.steps.some(step => step.label.startsWith('tools/'))).toBe(false)
  })

  it('一轮结束后，最后一轮的数据流保留下来', () => {
    const turn = timeline.turns.at(-1)!
    expect(turn.end).not.toBeNull()
    const flow = flowAt(timeline, timeline.frames.length - 1)
    expect(flow.turn?.id).toBe(turn.id)
    expect(flow.steps.at(-1)!.label).toBe('session/event · turn/end')
    expect(flow.edges.some(edge => edge.current)).toBe(false)
  })

  it('一步有多个接收方时，只有第一条边带标签', () => {
    const flow = flowAt(timeline, timeline.frames.length - 1)
    const assemble = flow.edges.filter(edge => edge.label === 'system-prompt/assemble')
    expect(assemble.length).toBeGreaterThan(1)
    expect(assemble.filter(edge => edge.primary)).toHaveLength(1)
  })

  it('没有接收方的步骤画成节点上的徽标', () => {
    const flow = flowAt(timeline, timeline.frames.length - 1)
    const checkpoints = flow.badges.filter(badge => badge.event === 'checkpoint')
    expect(checkpoints).toHaveLength(1)
    expect(checkpoints[0]!.count).toBe(4)
  })
})

describe('简明模式', () => {
  it('连续的会话日志事件合并成一步，记下合并了哪些类型', () => {
    const turn = timeline.turns[0]!
    const full = turnSteps(timeline, turn)
    const simple = turnSteps(timeline, turn, true)
    expect(simple.length).toBeLessThan(full.length - 10)
    expect(simple.some(step => step.event === 'session/event')).toBe(false)
    expect(simple.map(step => step.n)).toEqual(simple.map((_, index) => index + 1))
    const logged = simple.filter(step => step.event === 'log').flatMap(step => step.types ?? [])
    expect(logged).toEqual(full.filter(step => step.event === 'session/event').map(step => step.label.split(' · ')[1]))
    // 合并不跨过其他步骤：两段日志之间一定隔着别的事。
    for (const [index, step] of simple.entries()) {
      if (step.event === 'log') expect(simple[index + 1]?.event).not.toBe('log')
    }
  })

  it('回放跳过合并掉的帧，但每一步都还能停下', () => {
    const turn = timeline.turns[0]!
    const simple = turnSteps(timeline, turn, true)
    const list = new Set(stops(timeline, true))
    for (const step of simple) {
      expect(list.has(step.frame)).toBe(true)
      for (const frame of step.frames.slice(1)) expect(list.has(frame)).toBe(false)
    }
    expect(stops(timeline, false)).toHaveLength(timeline.frames.length)
  })

  it('数据流里不再画会话日志的扇出，日志写成 session 上的一个徽标', () => {
    const last = timeline.frames.length - 1
    const graph = timeline.graphs.at(-1)!
    const session = graph.nodes.find(node => node.label === 'session')!.id
    const simple = flowAt(timeline, last, { simple: true })
    expect(simple.edges.some(edge => edge.from === session)).toBe(false)
    expect(simple.badges.find(badge => badge.node === session)?.label).toBe('写入会话日志')
    expect(flowAt(timeline, last).edges.some(edge => edge.from === session)).toBe(true)
  })

  it('每个节点和每种步骤都有一句说明', () => {
    for (const node of timeline.graphs.at(-1)!.nodes) expect(nodeExplain(node), node.label).not.toBe('')
    for (const turn of timeline.turns) {
      for (const step of [...turnSteps(timeline, turn), ...turnSteps(timeline, turn, true)]) {
        expect(stepExplain(step), step.label).not.toBe('')
      }
    }
  })
})
