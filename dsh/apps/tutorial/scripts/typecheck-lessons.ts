/**
 * `pnpm typecheck:lessons`：课程代码只有和模板合成后才能解析 `./harness/...`，
 * 所以先把每一课的起始代码和答案各合成一份，再用一次 tsc 检查全部。
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contentRoot, lessonDirs, repoRoot, templateRoot } from './lesson-runner.ts'

const outDir = join(repoRoot, '.cache/lesson-types')
rmSync(outDir, { recursive: true, force: true })

for (const lesson of lessonDirs()) {
  for (const variant of ['files', 'solution'] as const) {
    const dir = join(outDir, lesson, variant)
    mkdirSync(dir, { recursive: true })
    cpSync(templateRoot, dir, { recursive: true })
    cpSync(join(contentRoot, lesson, '_files'), dir, { recursive: true })
    if (variant === 'solution') cpSync(join(contentRoot, lesson, '_solution'), dir, { recursive: true })
  }
}

writeFileSync(join(outDir, 'tsconfig.json'), JSON.stringify({
  extends: '../../tsconfig.base.json',
  compilerOptions: { noEmit: true },
  include: ['**/*.ts'],
}, null, 2))

try {
  execFileSync(join(repoRoot, 'node_modules/.bin/tsc'), ['-p', join(outDir, 'tsconfig.json')], { stdio: 'inherit' })
  console.log(`${lessonDirs().length} 课的起始代码和答案都通过了类型检查`)
} catch {
  process.exit(1)
}
