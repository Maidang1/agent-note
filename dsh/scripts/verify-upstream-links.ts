/**
 * `pnpm lessons:verify-upstream`：教程和文档引用的上游事实都锚定在同一个提交上。
 *
 * 1. 文档和课程里每个 deepseek-harness 永久链接都指向固定提交，且路径在该提交里存在；
 * 2. 课程模板 package.json 锁定的上游包版本与仓库根目录一致，浏览器里跑的和测试跑的是同一份代码。
 *
 * 使用 UPSTREAM_DIR 指定的检出；未设置时克隆到 .cache/upstream。
 */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const upstreamCommit: string = JSON.parse(readFileSync(join(repoRoot, 'upstream-lock.json'), 'utf8')).commit
const scanned = ['README.md', 'docs', 'apps/tutorial/src/content']
const permalink = /https:\/\/github\.com\/deepseek-ai\/deepseek-harness\/(?:blob|tree)\/([0-9a-f]{7,40})\/([^\s)"'>#]+)/g

function ensureUpstream(): string {
  const configured = process.env.UPSTREAM_DIR
  const dir = configured ?? join(repoRoot, '.cache/upstream')
  if (!configured && !existsSync(dir)) {
    // 并行调用时各自在旁边克隆，先改名成功的为准，调用方不会看到半成品。
    const tmp = `${dir}.${randomUUID().slice(0, 8)}`
    execFileSync('git', ['clone', '--filter=blob:none', '--no-checkout', 'https://github.com/deepseek-ai/deepseek-harness', tmp], { stdio: 'inherit' })
    execFileSync('git', ['-C', tmp, 'checkout', '--quiet', upstreamCommit], { stdio: 'inherit' })
    try {
      renameSync(tmp, dir)
    } catch (error) {
      rmSync(tmp, { recursive: true, force: true })
      if (!existsSync(dir)) throw error
    }
  }
  const head = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (head !== upstreamCommit) {
    if (configured) throw new Error(`${dir} 在 ${head}，应为 ${upstreamCommit}`)
    execFileSync('git', ['-C', dir, 'checkout', '--quiet', upstreamCommit], { stdio: 'inherit' })
  }
  return dir
}

function markdownFiles(path: string): string[] {
  const full = join(repoRoot, path)
  if (!existsSync(full)) return []
  if (!statSync(full).isDirectory()) return path.endsWith('.md') ? [path] : []
  return readdirSync(full).sort().flatMap(entry => markdownFiles(join(path, entry)))
}

const failures: string[] = []

const upstream = ensureUpstream()
let links = 0
for (const file of scanned.flatMap(markdownFiles)) {
  for (const match of readFileSync(join(repoRoot, file), 'utf8').matchAll(permalink)) {
    links++
    const [url, commit, path] = match as unknown as [string, string, string]
    if (commit !== upstreamCommit) failures.push(`${file}: ${url} 没有锚定到 ${upstreamCommit.slice(0, 8)}`)
    else if (!existsSync(join(upstream, decodeURIComponent(path)))) failures.push(`${file}: ${url} 指向的路径在上游不存在`)
  }
}

const rootDeps: Record<string, string> = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).dependencies
const templatePath = 'apps/tutorial/src/templates/default/package.json'
const templateDeps: Record<string, string> = JSON.parse(readFileSync(join(repoRoot, templatePath), 'utf8')).dependencies
for (const [name, version] of Object.entries(templateDeps)) {
  if (rootDeps[name] !== version) failures.push(`${templatePath}: ${name}@${version} 与根目录的 ${rootDeps[name] ?? '(未安装)'} 不一致`)
}

for (const failure of failures) console.log(`FAIL ${failure}`)
console.log(`检查了 ${links} 个上游链接、${Object.keys(templateDeps).length} 个模板依赖（上游 ${upstreamCommit.slice(0, 8)}，${relative(repoRoot, upstream) || upstream}）`)
if (failures.length) process.exit(1)
