/**
 * 在本机 Node 上运行课程：把模板目录和某一课的 `_files`（或再叠加 `_solution`）
 * 合成到临时目录，按页面里的同一条命令运行（不带 `--watch` 和流程图服务器）。依赖直接链接到仓库根目录的
 * node_modules，版本与模板 package.json 锁定的上游发布一致。
 */
import { execFile } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { Timeline } from '../src/templates/default/harness/diagram/model.ts'

export const appRoot = fileURLToPath(new URL('../', import.meta.url))
export const repoRoot = join(appRoot, '../..')
export const contentRoot = join(appRoot, 'src/content/tutorial')
export const templateRoot = join(appRoot, 'src/templates/default')

export type Variant = 'files' | 'solution'

/** 含 content.md 的课程目录，按路径排序，返回相对 contentRoot 的路径。 */
export function lessonDirs(dir = contentRoot): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry)
    if (!statSync(path).isDirectory() || entry.startsWith('_')) continue
    if (existsSync(join(path, 'content.md'))) found.push(relative(contentRoot, path))
    else found.push(...lessonDirs(path))
  }
  return found
}

export function hasSolution(lesson: string) {
  return existsSync(join(contentRoot, lesson, '_solution'))
}

/** 合成课程目录，返回路径；调用方负责删除。 */
export function materialize(lesson: string, variant: Variant): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-lesson-'))
  cpSync(templateRoot, dir, { recursive: true })
  cpSync(join(contentRoot, lesson, '_files'), dir, { recursive: true })
  if (variant === 'solution') cpSync(join(contentRoot, lesson, '_solution'), dir, { recursive: true })
  symlinkSync(join(repoRoot, 'node_modules'), join(dir, 'node_modules'), 'dir')
  return dir
}

const run = promisify(execFile)
const ANSI = /\x1b\[[0-9;]*m/g

export interface LessonOutput {
  code: number
  stdout: string
  stderr: string
  /** 流程图记录的时间线（进程退出时写出）。 */
  diagram?: Timeline
}

/** 运行一课，返回去掉颜色后的输出和流程图时间线；进程失败不抛错，由调用方检查 code。 */
export async function runLesson(lesson: string, variant: Variant): Promise<LessonOutput> {
  const dir = materialize(lesson, variant)
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: '1' }
    // 调用方指定了 LESSON_DIAGRAM_OUT 就写到那里（`pnpm lesson` 调试用），否则写在临时目录里。
    const diagramFile = process.env.LESSON_DIAGRAM_OUT ?? join(dir, '.diagram.json')
    env.LESSON_DIAGRAM_OUT = diagramFile
    const result = await run(process.execPath, ['main.ts'], { cwd: dir, env, timeout: 30_000 })
      .then(({ stdout, stderr }) => ({ code: 0, stdout, stderr }))
      .catch((error: { code?: number; stdout?: string; stderr?: string }) => ({ code: typeof error.code === 'number' ? error.code : 1, stdout: error.stdout ?? '', stderr: error.stderr ?? String(error) }))
    const diagram = existsSync(diagramFile) ? JSON.parse(readFileSync(diagramFile, 'utf8')) as Timeline : undefined
    return { code: result.code, stdout: result.stdout.replace(ANSI, ''), stderr: result.stderr.replace(ANSI, ''), ...diagram ? { diagram } : {} }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
