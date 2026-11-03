/**
 * 每一课的起始代码和答案都在本机 Node 上真实运行一遍，挂载的是 npm 上发布的上游插件。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contentRoot, hasSolution, lessonDirs, runLesson } from '../scripts/lesson-runner.ts'
import type { Variant } from '../scripts/lesson-runner.ts'
import type { Timeline } from '../src/templates/default/harness/diagram/model.ts'

interface Expectation {
  /** 输出必须包含的片段。 */
  includes: string[]
  /** 输出不能包含的片段。 */
  excludes?: string[]
  /** 流程图最后一帧里必须有的节点，写成 `标签@层:状态`。 */
  nodes?: string[]
  /** 流程图里不能出现的节点标签。 */
  absent?: string[]
  /** 数据流里必须出现的步骤，写成 `步骤标签 → 目标节点`，按出现顺序。 */
  flow?: string[]
}

/** 每一课两种代码各自的关键输出：起始代码展示问题，答案展示修正后的行为。 */
const expectations: Record<string, Record<Variant, Expectation>> = {
  '0-start/1-agent/1-one-turn': {
    files: { includes: ['你好！我会做加法，问我 1+2 试试。', '轮次结束  completed'], excludes: ['调用 add'], nodes: ['agent-loop@4:active', 'calculator@3:active'] },
    solution: { includes: ['调用 add({"a":1,"b":2})', '1+2 等于 3'], flow: ['请求 #1 → llm', 'tools/execute · add → calculator', '请求 #2 → llm'] },
  },
  '0-start/1-agent/2-reading-code': {
    files: { includes: ['没有规则匹配这次请求'] },
    solution: { includes: ['我是一个按脚本回答的模型', '轮次结束  completed'], excludes: ['没有规则匹配'] },
  },
  '1-kernel/1-plugins/1-base-services': {
    files: { includes: ['[plugin] SessionStore  active'], excludes: ['SystemPrompt'], nodes: ['root@0:active', 'session@1:active'], absent: ['llm', 'agent-loop'] },
    solution: {
      includes: ['SessionProjectionRegistry  active', 'AgentRegistry  active', 'SystemPrompt  active', 'LlmRuntime  active'],
      nodes: ['session@1:active', 'session-projection@1:active', 'agent@1:active', 'system-prompt@1:active', 'llm@1:active'],
    },
  },
  '1-kernel/1-plugins/2-dependencies': {
    files: { includes: ['ToolRuntime  pending，等待 systemPrompt', 'tools 最后的状态： pending'], nodes: ['tools@2:pending'], absent: ['system-prompt'] },
    solution: { includes: ['SystemPrompt  active', 'tools 最后的状态： active'], nodes: ['tools@2:active', 'system-prompt@1:active'] },
  },
  '1-kernel/1-plugins/3-agent-loop': {
    files: { includes: ['no adapter registered for provider "scripted"'], nodes: ['agent-loop@4:active'], absent: ['llm-scripted'], flow: ['请求 #1 → llm'] },
    solution: {
      includes: ['你好！有什么可以帮你？', '轮次结束  completed'],
      nodes: ['agent-loop@4:active', 'llm-scripted@2:active'],
      flow: ['session/event · user/message → session-projection', '请求 #1 → llm', '响应 #1 · 你好！有什么可以帮你？ → llm'],
    },
  },
  '1-kernel/1-plugins/4-add-a-tool': {
    files: { includes: ['tools: (无)', '我没有可以用的计算工具'], nodes: ['calculator@3:active'] },
    solution: { includes: ['调用 add({"a":1,"b":2})', '结果是 3'], flow: ['tools/pre-execute · add', 'tools/execute · add → calculator', '请求 #2 → llm'] },
  },
  '1-kernel/2-cordis/1-services': {
    files: { includes: ['只挂了消费方： pending'], excludes: ['active'], nodes: ['root@0:active', 'consumer@3:pending'] },
    solution: { includes: ['挂上提供方后： active', '卸载提供方后： pending'], nodes: ['consumer@3:pending', 'GreeterService@1:disposed'] },
  },
  '1-kernel/2-cordis/2-effects': {
    files: { includes: ['泄漏了'] },
    solution: { includes: ['已经停止'], excludes: ['泄漏了'] },
  },
  '1-kernel/2-cordis/3-waterfall': {
    files: { includes: ['结果： BLOCKED WORDS'] },
    solution: { includes: ['监听器 2 进入', '结果： ** BLOCKED **'], excludes: ['BLOCKED WORDS'] },
  },
  '1-kernel/3-composition/1-rows-and-patches': {
    files: { includes: ['system-prompt        disabled', '等待'] },
    solution: { includes: ['You are an AI agent powered by DeepSeek Harness.', '你是一个代码审查助手'], excludes: ['等待'] },
  },
  '1-kernel/4-turns/1-turns-and-steps': {
    files: { includes: ['这一轮有 2 个步骤'] },
    solution: { includes: ['调用 add({"a":3,"b":3})', '这一轮有 3 个步骤'] },
  },
  '1-kernel/4-turns/2-pre-step': {
    files: { includes: ['会话日志里有 2 条 user/message'], excludes: ['blocked'] },
    solution: { includes: ['轮次结束  blocked', '会话日志里有 1 条 user/message'] },
  },
  '1-kernel/4-turns/3-parallel': {
    files: { includes: ['  读完 a.ts\n  开始读 b.ts\n  读完 b.ts\n  开始读 c.ts', '│ tool: a.ts 的内容\n    │ tool: b.ts 的内容\n    │ tool: c.ts 的内容'] },
    solution: {
      includes: ['  开始读 a.ts\n  开始读 b.ts\n  开始读 c.ts\n  读完 b.ts\n  读完 c.ts\n  读完 a.ts', '│ tool: a.ts 的内容\n    │ tool: b.ts 的内容\n    │ tool: c.ts 的内容'],
      flow: ['tools/execute · read_file → files', 'tools/execute · read_file → files', 'tools/execute · read_file → files', 'tools/post-execute · read_file'],
    },
  },
  '1-kernel/4-turns/4-cancel': {
    files: { includes: ['  用户打断\n  扫描跑完了', '轮次结束  aborted', '日志里的工具结果： Error: tool call aborted （错误）'] },
    solution: { includes: ['轮次结束  aborted', '日志里的工具结果： Error: 扫描被中止 （错误）'], excludes: ['扫描跑完了'] },
  },
  '1-kernel/5-session-log/1-log-is-truth': {
    files: { includes: ['我不知道当前分支'] },
    solution: { includes: ['agent 状态： idle', 'user: 当前分支：main', '你在 main 分支上'] },
  },
  '1-kernel/6-prompt-and-tools/1-sections': {
    files: { includes: ['unknown prompt variable "{{user}}" in section "lesson:address"'] },
    solution: { includes: ['称呼用户为小林', '回答时使用短句', '轮次结束  completed'] },
  },
  '1-kernel/6-prompt-and-tools/2-tool-pipeline': {
    files: { includes: ['add 返回 5', 'add 返回 201'] },
    solution: { includes: ['add 返回 5', 'Error: 数字太大，拒绝执行'], excludes: ['add 返回 201'] },
  },
  '1-kernel/7-seams/1-model-adapter': {
    files: { includes: ['你说的是：2+3'], excludes: ['调用 add'] },
    solution: { includes: ['调用 add({"a":2,"b":3})', '你说的是：5'] },
  },
  '2-plugins/1-prompt-contributor/1-entry': {
    files: { includes: ['还没有 system-prompt： failed', '挂上 system-prompt 后： failed'] },
    solution: { includes: ['还没有 system-prompt： pending', '挂上 system-prompt 后： active'] },
  },
  '2-plugins/1-prompt-contributor/2-section': {
    files: { includes: ['配置被拒绝', '$.order expected number'], excludes: ['回答时使用短句'] },
    solution: { includes: ['配置被拒绝', '回答时使用短句'] },
  },
  '2-plugins/1-prompt-contributor/3-cleanup': {
    files: { includes: ['重新挂载失败', 'is already registered'] },
    solution: { includes: ['重新挂载成功'], excludes: ['重新挂载失败'] },
  },
  '2-plugins/1-prompt-contributor/4-scope': {
    files: { includes: ['回答时使用短句'], excludes: ['回答时使用英文'] },
    solution: { includes: ['回答时使用短句', '回答时使用英文'] },
  },
  '2-plugins/2-tool-guard/1-two-layers': {
    files: { includes: ['audit-enter', 'audit-return'], excludes: ['policy-enter'] },
    solution: { includes: ['policy-enter', 'policy-return'] },
  },
  '2-plugins/2-tool-guard/2-deny': {
    files: { includes: ['"decision":"allow"', '"isError":false'] },
    solution: { includes: ['"decision":"deny"', 'post-execute  {"tool":"add","isError":true}', 'Error: add is blocked by policy'], excludes: ['policy-return'] },
  },
  '2-plugins/2-tool-guard/3-per-agent': {
    files: { includes: ['[s] 工具结果：Error: add is blocked by policy', '[strict] 工具结果：Error: add is blocked by policy'] },
    solution: { includes: ['[s] 工具结果：3', '[strict] 工具结果：Error: add is blocked by policy'] },
  },
  '2-plugins/3-runtime-context/1-context': {
    files: { includes: ['system/message 事件： 2', 'user/message 事件： 3'] },
    solution: { includes: ['Current runtime context.', 'system/message 事件： 1', 'user/message 事件： 5'] },
  },
  '2-plugins/4-full-picture/1-all-together': {
    files: { includes: ['调用 add({"a":1,"b":2})', '结果是 3'], excludes: ['audit-enter'], absent: ['tool-guard'] },
    solution: {
      includes: ['audit-enter', 'policy-return', '结果是 3'],
      nodes: [
        'root@0:active', 'session@1:active', 'session-projection@1:active', 'agent@1:active', 'system-prompt@1:active', 'llm@1:active',
        'tools@2:active', 'llm-scripted@2:active',
        'calculator@3:active', 'prompt-contributor@3:active', 'git-branch@3:active', 'tool-guard@3:active',
        'agent-loop@4:active',
      ],
      flow: [
        'system-prompt/assemble → git-branch', '请求 #1 → llm', 'tools/pre-execute · add → tool-guard',
        '检查点 audit-enter', 'tools/execute · add → calculator', '响应 #2 · 结果是 3 → llm',
      ],
    },
  },
  '3-capabilities/1-approval/1-answerer': {
    files: {
      includes: ['审批请求：post_review，理由：发布评审需要人工确认', 'requires approval, but no approval channel is available', 'approval/decided {"outcome":"unavailable"}'],
      excludes: ['已发布到 PR #42'],
      nodes: ['user-approval@2:active', 'answerer@3:active', 'review@3:active'],
      flow: ['system-prompt/assemble → user-approval', 'tools/pre-execute · post_review → review', 'approval/request · post_review → answerer', 'tools/post-execute · post_review'],
    },
    solution: {
      includes: ['已发布到 PR #42：可以合并', 'approval/decided {"outcome":"allowed-once"}'],
      flow: ['approval/request · post_review → answerer', 'tools/execute · post_review → review'],
    },
  },
  '3-capabilities/1-approval/2-policy': {
    files: { includes: ['[ci] 审计： [\n  \'approval/asked {"toolName":"post_review"}\',\n  \'approval/decided {"outcome":"allowed-once"}\''], excludes: ['rejected tool'] },
    solution: {
      includes: [
        'The approval policy changed from "ask" to "never" (changed by the user).',
        'Approval prompts are disabled in this session',
        'Error: the user rejected tool "post_review"',
        '\'approval/policy {"policy":"never"}\'',
        'approval/decided {"outcome":"rejected"}',
      ],
    },
  },
  '3-capabilities/2-persistence/1-resume': {
    files: { includes: ['磁盘上的会话： []', '我不知道你叫什么'], excludes: ['你叫小林'] },
    solution: {
      includes: ["磁盘上的会话： [ 's' ]", '日志文件里有 11 条事件', '你叫小林'],
      nodes: ['session-persistence-jsonl@2:active', 'session-persistence@2:active'],
    },
  },
  '3-capabilities/2-persistence/2-checkpoint': {
    files: { includes: ['评审已经发到 PR #42', '进程退出，退出码 1', '磁盘上的会话： []', '继续什么？我们还没开始'] },
    solution: {
      includes: [
        "磁盘上的会话： [ 's' ]",
        'tool/call tool/result step/end turn/end session/end-seed',
        'The tool call was interrupted after it was recorded',
        '我先去 PR #42 看看评审有没有发出去',
      ],
    },
  },
  '3-capabilities/3-retry-and-usage/1-retry': {
    files: { includes: ['[busy] 轮次以错误结束  429 请求太多', '[busy] 失败的请求：1 次', '[auth] 轮次以错误结束  401 API key 无效'], excludes: ['你好！'] },
    solution: {
      includes: ['[response] #3  你好！', '[busy] 第 1/5 次重试，RATE_LIMIT，等 200ms', '[busy] 第 2/5 次重试，RATE_LIMIT，等 200ms', '[busy] 失败的请求：2 次', '[auth] 失败的请求：1 次'],
      excludes: ['[auth] 第'],
      flow: ['响应 #1 · 出错：429 请求太多', 'agent/request-error → llm-retry', '请求 #2 → llm', 'agent/request-error → llm-retry', '响应 #3 · 你好！'],
    },
  },
  '3-capabilities/3-retry-and-usage/2-budget': {
    files: { includes: ['步骤 7 开始前：已用 7500 tokens', '验算完了，等于 2', 'uncachedInputTokens: 8400'], excludes: ['blocked'] },
    solution: {
      includes: ['步骤 4 开始前：已用 3750 tokens', '轮次结束  blocked', 'uncachedInputTokens: 3600'],
      excludes: ['[response] #4'],
      nodes: ['token-meter@2:active', 'budget@3:active'],
    },
  },
  '3-capabilities/4-compaction/1-summary': {
    files: { includes: ['上下文约 1306 tokens（窗口 1500）', '请求超出了 1500 token 的上下文窗口'], excludes: ['compaction engin'] },
    solution: {
      includes: ['You are now acting as a compaction engin…', '[response] #6  收到', '上下文约 773 tokens（窗口 1500）', '压缩：6 条事件被摘要替换'],
      excludes: ['超出了'],
      nodes: ['compaction-basic@2:active'],
      flow: ['agent/pre-step → compaction-basic', '请求 #5 → llm', '请求 #6 → llm'],
    },
  },
  '3-capabilities/5-subagent/1-delegate': {
    files: { includes: ['tools: (无)', '没有可以委派的工具，我自己从头看', '父会话的轮次： 1'], excludes: ['started subagent'] },
    solution: {
      includes: ['调用 subagent({"description":"找 bug","prompt":"找出 PR #42 里的 bug"})', '│ user: 找出 PR #42 里的 bug', '发现 1 个 bug：parseConfig 没有处理空文件', '已经派子 agent 去找 bug 了', '子 agent 找到 1 个 bug，评审意见：parseConfig 要处理空文件', '父会话的轮次： 2'],
      nodes: ['subagent@2:active', 'subagent-spawn-in-process@2:active', 'tool-subagent@3:active', 'working-directory@2:active'],
      flow: ['tools/execute · subagent → tool-subagent', '请求 #2 → llm', '请求 #3 → llm', 'agent s 被唤醒 → agent-loop', '请求 #4 → llm'],
    },
  },
  '3-capabilities/6-mcp/1-stdio-server': {
    files: { includes: ['tools: mcp__pr__get_diff', '### MCP server: pr', 'tool: Error: Method not found: tools/call', '读不到 diff，没法评审', '[pr-server] 收到 tools/list', '[pr-server] 收到 tools/call get_diff'] },
    solution: {
      includes: ['调用 mcp__pr__get_diff({"pr":42})', '│ + return JSON.parse(text)', '空文件会让 JSON.parse 抛错，原来的判空不能删'],
      excludes: ['Method not found'],
      nodes: ['mcp-client@3:disposed'],
      flow: ['请求 #1 → llm', 'tools/execute · mcp__pr__get_diff → mcp-client', '请求 #2 → llm'],
    },
  },
  '3-capabilities/6-mcp/2-http': {
    files: { includes: ['[pr-server] POST server/discover', 'the server requires authorization (HTTP 401)', 'retrying in 500ms (attempt 1/10)', 'tools: (无)', '我拿不到 diff，没法评审'], excludes: ['POST tools/list'] },
    solution: {
      includes: ['[pr-server] POST initialize', '[pr-server] POST notifications/initialized', '[pr-server] GET', '[pr-server] POST tools/list', 'tools: mcp__pr__get_diff', '[pr-server] POST tools/call', '空文件会让 JSON.parse 抛错，原来的判空不能删'],
      excludes: ['[warn]'],
      nodes: ['mcp-client@3:disposed'],
      flow: ['tools/execute · mcp__pr__get_diff → mcp-client'],
    },
  },
  '3-capabilities/7-tool-results/1-spill': {
    files: { includes: ['[warn] spill-policy  spill-policy: Error: no ctx.spillStore backend loaded; keeping the inline content', '模型看到的工具结果：9908 字节，看得到 ERROR 那一行'], excludes: ['Omitted'] },
    solution: {
      includes: ['模型看到的工具结果：730 字节，看不到 ERROR 那一行', '(Omitted 9424 bytes. Full formatted result stored at: <路径>.', '完整结果文件：300 行，ERROR 在第 218 行：12:03:37 ERROR db.query timeout after 30s'],
      nodes: ['spill-policy@3:active', 'spill-local@1:active'],
      flow: ['tools/post-execute · read_log → spill-policy'],
    },
  },
  '3-capabilities/7-tool-results/2-prune': {
    files: { includes: ['[response] #8  ## Primary Request and Intent', '摘要： 1 次', '裁剪： 0 条工具结果', '日志里的 tool/result： 5 条'] },
    solution: {
      includes: ['[response] #8  这段没有异常', '上下文约 449 tokens（窗口 1500）', '摘要： 0 次', '裁剪： 4 条工具结果', '日志里的 tool/result： 9 条', '[... tool result middle pruned ...]', '[4-29] INFO request ok in 21ms'],
      excludes: ['compaction engin'],
      nodes: ['tool-result-pruner@2:active', 'compaction-basic@2:active'],
    },
  },
  '3-capabilities/8-guards/1-repeat': {
    files: { includes: ['查了 10 次还是 pending，放弃了', 'check_ci 调用了 10 次'], excludes: ['提醒（'] },
    solution: {
      includes: ['CI 一直是 pending，我先停下，等它跑完再看', 'check_ci 调用了 5 次', '提醒（check_ci × 3）：\nYou are repeating the exact same tool call', '提醒（check_ci × 5）：\nRepeated tool call detected:\n- tool: check_ci\n- consecutive_calls: 5'],
      nodes: ['repeat-tool-reminder@3:active'],
      flow: ['tools/post-execute · check_ci → repeat-tool-reminder'],
    },
  },
  '3-capabilities/8-guards/2-timeout': {
    files: { includes: ['CI 全部通过，可以合并', '工具结果： PR #42 的 CI 日志：全部通过', '用了 2 秒'] },
    solution: {
      includes: ['CI 日志下载超时了，我先评审代码，日志稍后再看', '工具结果： Error: tool call timed out after 300ms （错误）', '不到 1 秒就结束了'],
      nodes: ['timeout-policy@3:active'],
      flow: ['tools/execute · fetch_ci_log → timeout-policy'],
    },
  },
  '3-capabilities/9-testing/1-replay': {
    files: { includes: ['模型脚本 "offline" 没有规则匹配这次请求', '录制时的工具结果： ["3"]', '这次的工具结果： []', '不一致'] },
    solution: {
      includes: ['调用 add({"a":1,"b":2})', '[response] #2  1+2 等于 3', '这次的工具结果： ["3"]', '一致'],
      excludes: ['没有规则匹配', '不一致'],
      nodes: ['llm-replay@2:active'],
      flow: ['请求 #1 → llm-replay', 'tools/execute · add → calculator', '请求 #2 → llm-replay'],
    },
  },
}

/** 流程图断言：最后一帧的节点，以及数据流步骤的顺序。 */
function checkDiagram(diagram: Timeline | undefined, expectation: Expectation) {
  if (!expectation.nodes && !expectation.absent && !expectation.flow) return
  expect(diagram, '课程没有记录流程图').toBeDefined()
  const graph = diagram!.graphs.at(-1)!
  const label = (id: string | null) => graph.nodes.find(node => node.id === id)?.label ?? id
  const nodes = graph.nodes.map(node => `${node.label}@${node.layer}:${node.state}`)
  for (const node of expectation.nodes ?? []) expect(nodes).toContain(node)
  for (const name of expectation.absent ?? []) expect(graph.nodes.map(node => node.label)).not.toContain(name)
  const steps = diagram!.frames.flatMap(frame => frame.kind === 'flow' && frame.step ? [frame.step] : [])
  let cursor = 0
  for (const wanted of expectation.flow ?? []) {
    const [stepLabel, target] = wanted.split(' → ')
    const found = steps.findIndex((step, index) => index >= cursor && step.label === stepLabel && (!target || step.to.map(label).includes(target)))
    expect(found, `数据流里按顺序找不到「${wanted}」`).toBeGreaterThanOrEqual(0)
    cursor = found + 1
  }
}

const lessons = lessonDirs()

describe('课程目录', () => {
  it('每一课都有起始代码、答案和预期输出', () => {
    for (const lesson of lessons) {
      expect(existsSync(join(contentRoot, lesson, '_files', 'main.ts')), `${lesson} 缺少 _files/main.ts`).toBe(true)
      expect(hasSolution(lesson), `${lesson} 缺少 _solution`).toBe(true)
    }
    expect(Object.keys(expectations).sort()).toEqual([...lessons].sort())
  })
})

const variants: Variant[] = ['files', 'solution']

describe.concurrent.each(lessons)('%s', (lesson) => {
  for (const variant of variants) {
    it(variant, async () => {
      const output = await runLesson(lesson, variant)
      const text = output.stdout + output.stderr
      expect(output.code, text).toBe(0)
      const expectation = expectations[lesson]?.[variant]
      expect(expectation, `没有为 ${lesson} 写预期输出`).toBeDefined()
      for (const fragment of expectation!.includes) expect(text).toContain(fragment)
      for (const fragment of expectation!.excludes ?? []) expect(text).not.toContain(fragment)
      checkDiagram(output.diagram, expectation!)
    }, 60_000)
  }
})
