/**
 * 示意加载器（本项目代码，不是上游的 Cordis Loader）。它只模仿 cordis.patch.yml
 * 的三种操作，帮助理解“配置行 + patch → 插件树”：
 *
 * - 写出已有 id 和新的 config：替换该行的整个 config（不是合并）；
 * - insert：插入新行；
 * - disabled: true：保留该行，但不挂载。
 */
import type { Context, Fiber, Plugin } from '@deepseek-ai/cordis'
import { stateOf } from './harness/index.ts'

export interface Row {
  id: string
  plugin: Plugin
  config?: Record<string, unknown>
  disabled?: boolean
}

export type PatchOp =
  | { id: string; config?: Record<string, unknown>; disabled?: boolean }
  | { insert: Row[] }

export function applyPatch(rows: Row[], patch: PatchOp[]): Row[] {
  const result = rows.map(row => ({ ...row }))
  for (const op of patch) {
    if ('insert' in op) {
      result.push(...op.insert)
      continue
    }
    const row = result.find(item => item.id === op.id)
    if (!row) throw new Error(`patch 指向不存在的行 "${op.id}"`)
    if (op.config !== undefined) row.config = op.config
    if (op.disabled !== undefined) row.disabled = op.disabled
  }
  return result
}

/** 按书写顺序挂载每个未禁用的行。何时激活由 inject 决定，不由顺序决定。 */
export function mount(root: Context, rows: Row[]): Map<string, Fiber> {
  const fibers = new Map<string, Fiber>()
  for (const row of rows) {
    if (!row.disabled) fibers.set(row.id, root.plugin(row.plugin, row.config ?? {}))
  }
  return fibers
}

/** 像启动器那样报告每一行：没激活的行列出它还在等的服务。 */
export function report(rows: Row[], fibers: Map<string, Fiber>) {
  for (const row of rows) {
    const fiber = fibers.get(row.id)
    if (!fiber) {
      console.log(`  ${row.id.padEnd(20)} disabled`)
      continue
    }
    const missing = Object.keys(fiber.inject).filter(name => fiber.parent.get(name) === undefined)
    const waiting = missing.length ? `  等待 ${missing.join(', ')}` : ''
    console.log(`  ${row.id.padEnd(20)} ${stateOf(fiber)}${waiting}`)
  }
}
