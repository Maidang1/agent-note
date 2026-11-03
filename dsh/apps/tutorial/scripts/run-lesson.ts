/**
 * `pnpm lesson <课程路径> [--solution]`：在本机运行一课并打印输出。
 * 不带路径时列出全部课程。
 */
import { lessonDirs, runLesson } from './lesson-runner.ts'

const args = process.argv.slice(2)
const lesson = args.find(arg => !arg.startsWith('--'))
if (!lesson) {
  for (const dir of lessonDirs()) console.log(dir)
  process.exit(0)
}
const match = lessonDirs().find(dir => dir === lesson || dir.endsWith(lesson))
if (!match) {
  console.error(`没有课程 ${lesson}`)
  process.exit(1)
}
const output = await runLesson(match, args.includes('--solution') ? 'solution' : 'files')
process.stdout.write(output.stdout)
process.stderr.write(output.stderr)
process.exit(output.code)
