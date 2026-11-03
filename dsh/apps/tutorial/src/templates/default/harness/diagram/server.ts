/**
 * 流程图预览服务器。课程的 `npm start` 用 `--import` 预先加载它：它在 4300 端口提供
 * 预览页面，并通过 SSE 把记录器的时间线推给页面。TutorialKit 的预览面板显示这个端口。
 *
 * 课程代码跑完以后，服务器让进程继续运行，预览一直可看；`node --watch` 在文件变化时
 * 重启整个进程。本机测试不加载这个文件。
 */
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { ServerResponse } from 'node:http'
import { onDiagram } from './recorder.ts'
import type { DiagramRecorder } from './recorder.ts'

const PORT = Number(process.env.LESSON_DIAGRAM_PORT ?? 4300)

const assets: Record<string, [file: string, type: string]> = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/layout.js': ['layout.js', 'text/javascript; charset=utf-8'],
  '/glossary.js': ['glossary.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
}

let recorder: DiagramRecorder | undefined
const clients = new Set<ServerResponse>()
let pending: NodeJS.Timeout | undefined

const payload = () => JSON.stringify(recorder?.timeline ?? null)

function broadcast() {
  pending ??= setTimeout(() => {
    pending = undefined
    const data = `data: ${payload()}\n\n`
    for (const client of clients) client.write(data)
  }, 40)
}

let unsubscribe: (() => void) | undefined
onDiagram((next) => {
  unsubscribe?.()
  recorder = next
  unsubscribe = next.subscribe(broadcast)
  broadcast()
})

const server = createServer((request, response) => {
  // 教程页面是跨源隔离的（COEP require-corp），嵌在里面的预览要声明允许被跨源嵌入。
  response.setHeader('cross-origin-embedder-policy', 'require-corp')
  response.setHeader('cross-origin-resource-policy', 'cross-origin')
  const path = (request.url ?? '/').split('?')[0]!
  if (path === '/timeline') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    response.end(payload())
    return
  }
  if (path === '/events') {
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
    response.write(`retry: 500\ndata: ${payload()}\n\n`)
    clients.add(response)
    request.on('close', () => clients.delete(response))
    return
  }
  const asset = assets[path]
  if (path === '/favicon.ico') {
    response.writeHead(204).end()
    return
  }
  if (!asset) {
    response.writeHead(404).end()
    return
  }
  response.writeHead(200, { 'content-type': asset[1], 'cache-control': 'no-store' })
  response.end(readFileSync(new URL(asset[0], import.meta.url)))
}).listen(PORT, '127.0.0.1')

// `node --watch` 重启或换课时进程收到 SIGTERM：先把 SSE 流正常结束，页面就只是重连，不会报传输中断。
process.once('SIGTERM', () => {
  for (const client of clients) client.end()
  server.close(() => process.exit(0))
  server.closeAllConnections()
})

// 课程代码抛错时打印错误，但保留进程，让流程图停在出错的那一刻。
const report = (error: unknown) => {
  console.error(error)
  process.exitCode = 1
}
process.on('uncaughtException', report)
process.on('unhandledRejection', report)
