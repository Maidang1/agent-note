/** 两个进程共用的会话存储配置。`compression: 'none'` 让日志保持逐行可读的 JSONL。 */
export function store(root = process.env.SESSION_ROOT!) {
  return { root, compression: 'none' as const }
}

/** 两次运行用同一个模型脚本：发布评审，恢复后先核实。 */
export const script = {
  id: 'reviewer',
  rules: [
    { id: 'post', match: { lastUserText: '给 PR #42 发布评审' }, respond: { kind: 'tool-call' as const, tool: 'post_review', arguments: { pr: 42, body: '可以合并' } } },
    { id: 'verify', match: { lastUserText: '继续', userIncludes: ['给 PR #42 发布评审'] }, respond: { kind: 'text' as const, chunks: ['上次发布的结果未知，我先去 PR #42 看看评审有没有发出去'] } },
    { id: 'fresh', match: { lastUserText: '继续' }, respond: { kind: 'text' as const, chunks: ['继续什么？我们还没开始'] } },
  ],
}
