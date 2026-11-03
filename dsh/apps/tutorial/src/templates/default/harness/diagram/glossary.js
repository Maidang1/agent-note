// 流程图里的大白话：每个节点、每种步骤用一句话说明它在做什么。纯数据和纯函数，浏览器和单元测试共用。

/** @typedef {import('./model.ts').DiagramNode} DiagramNode */
/** @typedef {{ event: string, label: string, types?: string[] }} StepLike */

/** 内核和课程插件，按节点标签。 */
const NODES = {
  root: '所有插件都挂在这个根上。它本身什么也不做，只是插件树的起点。',
  session: '会话日志：按顺序记下一次对话里发生的每件事，只追加、不修改。',
  'session-projection': '从会话日志里整理出界面和插件要用的状态，比如“现在有几条消息”。',
  agent: 'agent 注册表：记录有哪些 agent 正在运行，别的插件通过它找到 agent。',
  'system-prompt': '提示词组装：收集各个插件贡献的提示词片段和工具说明，拼成发给模型的 system 文本。',
  llm: '模型入口：把请求转交给对应的模型适配器，自己不生成文字。',
  tools: '工具运行时：保存插件登记的工具，模型要调用工具时负责检查和执行。',
  'llm-scripted': '本教程的假模型：按写好的规则回答，不联网、不需要 API key，每次结果都一样。',
  'agent-loop': 'agent 主循环：收到用户输入后，反复“组装请求 → 问模型 → 执行工具”，直到模型不再调用工具。',
  calculator: '课程里写的计算器插件：登记了一个做加法的 add 工具。',
  'prompt-contributor': '课程里写的提示词插件：往系统提示词里加一句“回答时使用短句”。',
  'git-branch': '课程里写的上下文插件：告诉模型当前在哪个 git 分支。',
  'tool-guard': '课程里写的工具守卫：在工具执行前审计，按配置拒绝某些工具。',
  'secret-filter': '课程里写的过滤插件：消息里有“密码”时拒绝这一步。',
  'llm-echo': '课程里写的模型适配器：把用户的话念回去。',
  policy: '课程里写的工具策略插件：放行、改写或拒绝工具调用。',
  style: '课程里写的提示词插件：贡献两段提示词和一个变量。',
  'user-approval': '审批服务：工具要求确认时，先写审计日志，再按会话策略问应答者；没人回答就拒绝。',
  review: '课程里写的评审插件：登记 post_review 工具，并要求发布前先审批。',
  answerer: '课程里写的应答者：替用户回答审批请求。',
  'session-persistence-jsonl': 'JSONL 持久化后端：监听会话日志，把每个会话的事件追加到磁盘上的一个文件里。',
  'session-persistence': '持久化服务：按会话 id 创建、打开、列出磁盘上的会话日志，恢复会话时从这里读。',
  'session-checkpoint-policy': '检查点策略：请求模型、执行工具、开始下一步之前，先把会话日志刷到磁盘。',
  'llm-retry': '重试执行器：模型请求遇到限流、服务端错误这类暂时的失败时，按路由的重试策略等一会儿再试。',
  'token-meter': 'token 计量：从会话日志里折叠出用了多少 token、上下文有多满，供压缩和界面读取。',
  budget: '课程里写的预算插件：每一步开始前检查用掉的 token，超过预算就停下。',
  'compaction-basic': '上下文压缩：上下文快满时，请模型把旧对话写成摘要，用摘要替换旧消息，近期的消息原样保留。',
  'fs-local': '本机文件系统：提供 fs 服务，别的插件通过它读写文件。',
  'repeat-tool-reminder': '重复调用提醒：模型连续用相同参数调用同一个工具时，在工具结果后面附一条提醒；不拦截调用。',
  'timeout-policy': '工具超时策略：给声明了 timeoutMs 的工具加截止时间，到点中止 exec.signal，结果换成超时错误。',
  'tool-result-pruner': '工具结果裁剪：压缩触发时，先把过长的工具结果换成首尾两段，不调用模型；原始结果仍留在日志里。',
  'spill-local': '本地 spill 存储：把过长的内容写成本机私有临时目录里的文件，提供 spillStore 服务。',
  'spill-policy': 'spill 策略：工具结果超过预算时，把完整结果交给 spillStore 保存，模型只拿到首尾预览和文件路径。',
  'working-directory': '工作目录：记录每个 agent 当前在哪个目录，并告诉模型。',
  subagent: '子 agent 运行时：管理委派出去的任务，负责准入、取消和完成通知。',
  'subagent-spawn-in-process': '进程内子 agent 后端：在当前进程里新建一个子 agent，从空对话开始做委派的任务。',
  'tool-subagent': '委派工具：给模型一个 subagent 工具，调用后立刻返回任务 id，子 agent 在后台运行。',
  activation: '一次委派的所有者：子 agent 运行期间的资源都挂在它下面，任务结束就释放。',
  'llm-replay': '模型回放：在 llm/stream 上拦下每次请求，按顺序送回录制会话里模型的输出，不调用任何模型。',
  'mcp-client': 'MCP 客户端：连接一台 MCP 服务器，把它的工具以 mcp__<服务器名>__<工具名> 登记到工具表；调用时转发给服务器。',
}

/** 没有登记的节点，按种类和层次给一句通用说明。 */
export function nodeExplain(node) {
  if (NODES[node.label]) return NODES[node.label]
  if (node.kind === 'scope') return `${node.label.replace(/^agent /, '会话 ')} 的 agent 自己的作用域：只对这个 agent 生效的注册都挂在这里。`
  if (node.provides.length) return `提供 ${node.provides.join('、')} 服务，别的插件通过 ctx.${node.provides[0]} 使用它。`
  if (node.injects.length) return `依赖 ${node.injects.join('、')}，往这些服务里贡献内容或监听它们的事件。`
  return '一个插件。'
}

/** 每种步骤的说明。`tools/*` 的标签带着工具名，所以按事件查。 */
const STEPS = {
  input: '用户发来一条消息，交给 agent 主循环处理。',
  wake: '不是用户发消息，而是后台的事情（例如子 agent 完成）唤醒了 agent，开始新的一轮。',
  'agent/pre-step': '每一步开始前的决策点：插件可以在这里改写输入，或者拒绝这一步。',
  'agent/request-error': '模型请求失败后的决策点：插件决定重试，还是让这一轮以错误结束。',
  'system-prompt/assemble': '把各个插件登记的提示词片段、上下文和工具说明拼起来，准备发给模型。',
  'llm/stream': '把组装好的请求（系统提示词、历史消息、可用工具）发给模型。',
  'llm/response': '模型的回答回来了：要么是一段文字，要么是“请帮我调用某个工具”。',
  'tools/pre-execute': '执行工具之前先问一圈：能不能执行？插件可以放行、拒绝或要求确认。',
  'tools/execute': '真正运行工具，比如计算 1+2。',
  'tools/post-execute': '工具跑完后检查结果，插件可以改写给模型看的内容。',
  'tools/result': '通知所有关心的插件：工具执行完了。只能看，不能改。',
  'approval/request': '工具要求确认，审批服务把问题交给应答者：允许一次、拒绝，或者没人回答。',
  checkpoint: '课程代码打的检查点，用来看清事情发生的顺序。',
  log: '把刚发生的事写进会话日志。模型看到的一切都先记在这里。',
}

/** 会话日志里常见的事件类型。 */
const LOG_TYPES = {
  'turn/start': '一轮对话开始',
  'turn/end': '一轮对话结束',
  'step/start': '一步开始',
  'step/end': '一步结束',
  'agent/inbox/spliced': '用户消息进入 agent 的收件箱',
  'system/message': '记下系统提示词',
  'user/message': '记下用户消息',
  'assistant/message': '记下模型的回答',
  'assistant/attempt': '记下一次失败的模型请求',
  'tool/call': '记下模型要调用的工具',
  'tool/result': '记下工具结果',
  'request/header': '记下这次请求用的模型和参数',
  'request/context': '记下这次请求的上下文统计',
  'approval/asked': '记下一次审批请求',
  'approval/decided': '记下审批结果',
  'approval/policy': '记下会话的审批策略',
  'llm/retry': '记下一次计划好的重试和等待时间',
  'llm/retry-started': '记下重试开始',
  'compaction/start': '记下压缩开始',
  'compaction/summary': '记下压缩摘要和被替换的范围',
  'compaction/end': '记下压缩结束',
}

/** 步骤的一句话说明。 */
export function stepExplain(step) {
  if (step.event === 'session/event') {
    const type = step.label.split(' · ')[1]
    return `${LOG_TYPES[type] ?? '写入一条会话事件'}。${STEPS.log}`
  }
  if (step.event === 'log') {
    const parts = (step.types ?? []).map(type => LOG_TYPES[type] ?? type)
    return `${parts.join('，')}。${STEPS.log}`
  }
  return STEPS[step.event] ?? ''
}
