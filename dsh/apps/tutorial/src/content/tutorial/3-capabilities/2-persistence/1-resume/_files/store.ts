/** 两个进程共用的会话存储配置。`compression: 'none'` 让日志保持逐行可读的 JSONL。 */
export function store(root = process.env.SESSION_ROOT!) {
  return { root, compression: 'none' as const }
}

/** 两次运行用同一个模型脚本：记名字，再问名字。 */
export const script = {
  id: 'memo',
  rules: [
    { id: 'recall', match: { lastUserText: '我叫什么？', userIncludes: ['我叫小林'] }, respond: { kind: 'text' as const, chunks: ['你叫小林'] } },
    { id: 'unknown', match: { lastUserText: '我叫什么？' }, respond: { kind: 'text' as const, chunks: ['我不知道你叫什么'] } },
    { id: 'ack', match: { lastUserText: '我叫小林' }, respond: { kind: 'text' as const, chunks: ['记住了'] } },
  ],
}
