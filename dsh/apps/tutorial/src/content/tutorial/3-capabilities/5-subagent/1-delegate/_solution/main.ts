import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as SpawnInProcess from '@deepseek-ai/dsh-subagent-spawn-in-process'
import * as SubagentTool from '@deepseek-ai/dsh-tool-subagent'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import { createHarness } from './harness/index.ts'

const harness = await createHarness({
  script: {
    id: 'reviewer',
    rules: [
      // 子 agent 收到的任务。
      { id: 'child', match: { userIncludes: ['找出 PR #42 里的 bug'] }, respond: { kind: 'text', chunks: ['发现 1 个 bug：parseConfig 没有处理空文件'] } },
      // 父 agent 收到子 agent 的完成通知。
      { id: 'report', match: { userIncludes: ['Its closing message:'] }, respond: { kind: 'text', chunks: ['子 agent 找到 1 个 bug，评审意见：parseConfig 要处理空文件'] } },
      { id: 'started', match: { afterToolResult: true }, respond: { kind: 'text', chunks: ['已经派子 agent 去找 bug 了'] } },
      // 父 agent：有 subagent 工具就委派，没有就自己做。
      { id: 'delegate', match: { userIncludes: ['审查 PR #42'], declaredTools: ['subagent'] }, respond: { kind: 'tool-call', tool: 'subagent', arguments: { description: '找 bug', prompt: '找出 PR #42 里的 bug' } }, maxUses: 1 },
      { id: 'alone', match: { userIncludes: ['审查 PR #42'] }, respond: { kind: 'text', chunks: ['没有可以委派的工具，我自己从头看'] }, maxUses: 1 },
    ],
  },
  show: { messages: true, truncate: 70 },
})

// 子 agent 的会话要能在之后继续对话，所以需要会话持久化。
await harness.plugin(JsonlPersistence, { root: mkdtempSync(join(tmpdir(), 'dsh-sessions-')), compression: 'none' })
// 子 agent 继承父 agent 的工作目录：工作目录服务依赖文件系统服务。
await harness.plugin(LocalFileSystem)
await harness.plugin(WorkingDirectory)
// 子 agent 运行时：准入、取消、完成通知。
await harness.plugin(Subagents)
// 进程内后端：注册名为 spawn 的提供方。
await harness.plugin(SpawnInProcess)

// 给模型的委派工具，委派给名为 spawn 的提供方。
await harness.plugin(SubagentTool, { provider: 'spawn' })

await harness.send('审查 PR #42')
// 子 agent 在后台运行。委派了的话，等父 agent 被完成通知唤醒的那一轮也结束。
if (harness.events().some(event => event.type === 'tool/call')) {
  await harness.until(events => events.filter(event => event.type === 'turn/end').length === 2)
}
console.log('父会话的轮次：', harness.events().filter(event => event.type === 'turn/end').length)
await harness.dispose()
