import { Context } from '@deepseek-ai/cordis'
import { draw, kernel, settle, stateOf } from './harness/index.ts'
import * as contributor from './contributor.ts'

const root = new Context()
draw(root) // 把这个根交给流程图
const fiber = root.plugin(contributor)
await settle()
console.log('还没有 system-prompt：', stateOf(fiber))

root.plugin(kernel['system-prompt'], {})
await settle()
console.log('挂上 system-prompt 后：', stateOf(fiber))
