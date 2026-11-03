import { Context } from '@deepseek-ai/cordis'
import { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { draw, kernel, settle } from './harness/index.ts'
import { applyPatch, mount, report } from './loader.ts'
import type { PatchOp, Row } from './loader.ts'

// 组合包：一组配置行。顺序是故意打乱的。
const bundle: Row[] = [
  { id: 'agent-loop', plugin: kernel['agent-loop'] },
  { id: 'tools', plugin: kernel.tools },
  { id: 'agent', plugin: kernel.agent },
  { id: 'llm', plugin: kernel.llm },
  { id: 'session', plugin: kernel.session },
  { id: 'session-projection', plugin: kernel['session-projection'] },
  { id: 'system-prompt', plugin: kernel['system-prompt'], config: { includeHarnessIdentity: false, personaPrefix: '你是一个助手' } },
]

// 用户 patch：叠在组合包之后，优先级更高。
const userPatch: PatchOp[] = [
  { id: 'system-prompt', disabled: true },
]

const rows = applyPatch(bundle, userPatch)
const root = new Context()
draw(root) // 把这个根交给流程图
const fibers = mount(root, rows)
await settle()

console.log('插件树：')
report(rows, fibers)

const systemPrompt = root.get('systemPrompt')
if (systemPrompt) {
  console.log('组装出的系统提示词：')
  console.log(renderPrompt(await systemPrompt.assemble()))
}
