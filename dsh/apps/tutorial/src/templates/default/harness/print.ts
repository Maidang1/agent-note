/** 终端输出格式：每行一个标签，内容缩进对齐。 */
const COLORS = {
  user: 36,
  plugin: 94,
  request: 33,
  response: 32,
  checkpoint: 35,
  event: 34,
  turn: 90,
  info: 90,
  warn: 93,
  error: 31,
} as const

export type Kind = keyof typeof COLORS

const paint = (kind: Kind, text: string) => `\x1b[${COLORS[kind]}m${text}\x1b[0m`

function format(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** 打印一行：`[kind] label  detail`。 */
export function print(kind: Kind, label: string, detail?: unknown) {
  const head = `${paint(kind, `[${kind}]`)} ${label}`
  console.log(detail === undefined ? head : `${head}  ${format(detail)}`)
}

/** 打印多行块，例如 system 文本：每行前加竖线，便于看清边界。 */
export function block(title: string, text: string) {
  const lines = text.length ? text.split('\n') : ['(空)']
  console.log(`    ${paint('info', title)}`)
  for (const line of lines) console.log(`    ${paint('info', '│')} ${line}`)
}
