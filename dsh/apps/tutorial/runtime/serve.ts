/**
 * `pnpm start` 和端到端测试用的服务器：提供构建好的站点（dist/），并挂上本机运行时。
 *
 *   node apps/tutorial/runtime/serve.ts [--port 4321] [--host 127.0.0.1]
 */
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createConnection } from 'node:net'
import { extname, join, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { PREVIEW_PORTS, WORKSPACE } from './config.ts'
import { attachRuntime } from './server.ts'

const { values } = parseArgs({ options: { port: { type: 'string', default: '4321' }, host: { type: 'string', default: '127.0.0.1' } } })
const dist = resolve(import.meta.dirname, '../dist')

if (!existsSync(join(dist, 'index.html'))) {
  console.error('没有找到 apps/tutorial/dist，请先运行 pnpm build。')
  process.exit(1)
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

/** URL 对应的文件：目录取 index.html，找不到返回 undefined。 */
function locate(pathname: string) {
  const full = resolve(dist, `.${decodeURIComponent(pathname)}`)
  if (full !== dist && !full.startsWith(dist + sep)) return undefined
  for (const candidate of [full, join(full, 'index.html'), `${full}.html`]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return undefined
}

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost')
  const file = locate(pathname) ?? join(dist, '404.html')
  const status = locate(pathname) ? 200 : 404
  response.writeHead(status, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    // 和 TutorialKit 开发服务器一致：跨源隔离，预览服务器相应地带上 CORP 头。
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-opener-policy': 'same-origin',
  })
  response.end(existsSync(file) ? await readFile(file) : 'Not Found')
})

attachRuntime(server, { workspace: WORKSPACE, ports: PREVIEW_PORTS })

/** localhost 可能解析到 127.0.0.1 或 ::1，两个地址上有别的服务器占着端口，浏览器就会打开那个旧服务器。 */
function occupied(port: number) {
  const probe = (host: string) => new Promise<boolean>((done) => {
    const socket = createConnection({ port, host })
    socket.once('connect', () => { socket.destroy(); done(true) })
    socket.once('error', () => done(false))
  })
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then(results => results.some(Boolean))
}

if (await occupied(Number(values.port))) {
  console.error(`端口 ${values.port} 已经有服务器在运行（可能是之前启动的 astro preview 或 pnpm start）。先结束它，或者用 --port 换一个端口。`)
  process.exit(1)
}

server.listen(Number(values.port), values.host, () => {
  console.log(`教程已启动：http://${values.host === '127.0.0.1' ? 'localhost' : values.host}:${values.port}/`)
  console.log(`课程代码运行在本机：${WORKSPACE}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close()
    process.exit(0)
  })
}
