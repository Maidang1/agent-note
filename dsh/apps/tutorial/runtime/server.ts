/**
 * 本机运行时：代替 WebContainer。
 *
 * 浏览器里的 TutorialKit 通过 `@webcontainer/api` 的替身（client.ts）用 WebSocket 连到这里：
 * 文件操作落在本机的课程工作区，命令在伪终端里用本机的 Node 运行，预览端口由这里探测后通知页面。
 * 工作区在仓库目录下，课程代码按 Node 的模块解析直接用到仓库根目录 node_modules 里的上游包。
 *
 * 这个服务能在本机执行任意命令，所以只接受来自本机回环地址、Host 和 Origin 都是本机的连接。
 */
import { chmodSync, existsSync, statSync, watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, Server } from 'node:http'
import { createRequire } from 'node:module'
import { createConnection } from 'node:net'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { Duplex } from 'node:stream'
import { crc32, deflateRawSync } from 'node:zlib'
import type { IPty } from 'node-pty'
import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'

export const RUNTIME_PATH = '/__lesson-runtime'

/** WebContainer 里课程目录的绝对路径；TutorialKit 导出 zip 时会用到它。 */
const WORKDIR = '/home/tutorial'

export interface RuntimeOptions {
  /** 课程工作区，每次页面连接时清空。 */
  workspace: string
  /** 需要探测的预览端口，和 meta.md 里的 `previews` 一致。 */
  ports: number[]
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

function isLocal(request: IncomingMessage) {
  if (!LOOPBACK.has(request.socket.remoteAddress ?? '')) return false
  if (!LOCAL_HOST.test(request.headers.host ?? '')) return false
  const origin = request.headers.origin
  if (!origin) return true
  try {
    return LOCAL_HOST.test(new URL(origin).host)
  } catch {
    return false
  }
}

const require = createRequire(import.meta.url)

/** node-pty 的预编译包里 spawn-helper 可能没有执行权限（安装脚本被跳过时），这里补上。 */
function loadPty(): typeof import('node-pty') {
  const root = dirname(require.resolve('node-pty/package.json'))
  for (const helper of [join(root, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'), join(root, 'build/Release/spawn-helper')]) {
    if (existsSync(helper) && !(statSync(helper).mode & 0o111)) chmodSync(helper, 0o755)
  }
  return require('node-pty')
}

let pty: typeof import('node-pty') | undefined

/** 子进程的环境：去掉 pnpm 脚本带进来的 npm_* 变量，打开颜色。 */
function childEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('npm_') && key !== 'INIT_CWD' && key !== 'PNPM_SCRIPT_SRC_DIR') env[key] = value
  }
  return { ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor', FORCE_COLOR: '1' }
}

interface Child {
  term: IPty
  exited: Promise<void>
  owner: Session
}

type FileNode = { file: { contents: string | { base64: string } } } | { directory: Record<string, FileNode> }

/** 一个页面连接。最近连上的页面独占工作区：它启动时结束其他页面的进程。 */
class Session {
  readonly children = new Map<number, Child>()
  readonly watchers = new Map<number, FSWatcher>()
  readonly runtime: Runtime
  readonly socket: WebSocket

  constructor(runtime: Runtime, socket: WebSocket) {
    this.runtime = runtime
    this.socket = socket
  }

  send(message: object) {
    if (this.socket.readyState === this.socket.OPEN) this.socket.send(JSON.stringify(message))
  }

  path(path: string) {
    const root = this.runtime.options.workspace
    const inner = path === WORKDIR || path.startsWith(`${WORKDIR}/`) ? path.slice(WORKDIR.length) : path
    const full = resolve(root, `.${inner.startsWith('/') ? '' : '/'}${inner}`)
    if (full !== root && !full.startsWith(root + sep)) throw Object.assign(new Error(`路径不在工作区内：${path}`), { code: 'EACCES' })
    return full
  }

  async handle(op: string, args: Record<string, any>): Promise<unknown> {
    switch (op) {
      case 'boot':
        await this.runtime.claim(this)
        return { workdir: WORKDIR, ports: this.runtime.openPorts() }
      case 'readFile': {
        const data = await readFile(this.path(args.path))
        return args.encoding ? data.toString(args.encoding) : { base64: data.toString('base64') }
      }
      case 'writeFile': {
        const full = this.path(args.path)
        await mkdir(dirname(full), { recursive: true })
        await writeFile(full, typeof args.data === 'string' ? args.data : Buffer.from(args.data.base64, 'base64'))
        return null
      }
      case 'readdir': {
        const entries = await readdir(this.path(args.path), { withFileTypes: true })
        return entries.map(entry => ({ name: entry.name, file: entry.isFile(), directory: entry.isDirectory() }))
      }
      case 'mkdir':
        await mkdir(this.path(args.path), { recursive: !!args.recursive })
        return null
      case 'rm':
        await rm(this.path(args.path), { recursive: !!args.recursive, force: !!args.force })
        return null
      case 'mount':
        await this.mount(this.path(args.mountPoint ?? '/'), args.tree)
        return null
      case 'spawn':
        return this.spawn(args.pid, args.command, args.args ?? [], args.terminal)
      case 'input':
        this.children.get(args.pid)?.term.write(args.data)
        return null
      case 'resize':
        this.children.get(args.pid)?.term.resize(Math.max(1, args.cols), Math.max(1, args.rows))
        return null
      case 'kill':
        this.kill(args.pid)
        return null
      case 'watch':
        this.watch(args.wid, args.path, !!args.recursive)
        return null
      case 'unwatch':
        this.watchers.get(args.wid)?.close()
        this.watchers.delete(args.wid)
        return null
      case 'export':
        return { base64: (await zip(this.path(args.path), new Set(args.excludes ?? []))).toString('base64') }
      default:
        throw new Error(`不支持的操作：${op}`)
    }
  }

  async mount(dir: string, tree: Record<string, FileNode>) {
    await mkdir(dir, { recursive: true })
    for (const [name, node] of Object.entries(tree)) {
      const full = this.path(relative(this.runtime.options.workspace, join(dir, name)).split(sep).join('/'))
      if ('directory' in node) await this.mount(full, node.directory)
      else {
        const contents = node.file.contents
        await writeFile(full, typeof contents === 'string' ? contents : Buffer.from(contents.base64, 'base64'))
      }
    }
  }

  async spawn(pid: number, command: string, args: string[], terminal?: { cols: number, rows: number }) {
    // 先等上一批被结束的进程真正退出，免得新进程抢不到它们占着的端口。
    await this.runtime.settle()
    pty ??= loadPty()
    const shell = command === '/bin/jsh'
    const file = shell ? process.env.SHELL || '/bin/sh' : command
    const term = pty.spawn(file, shell ? ['-i'] : args, {
      name: 'xterm-256color',
      cols: terminal?.cols ?? 80,
      rows: terminal?.rows ?? 24,
      cwd: this.runtime.options.workspace,
      env: childEnv(),
    })
    // TutorialKit 等 jsh 发出这个 OSC 序列后才把键盘输入转给它。
    if (shell) this.send({ type: 'output', pid, data: '\x1b]654;interactive\x07' })
    term.onData(data => this.send({ type: 'output', pid, data }))
    const exited = new Promise<void>((done) => {
      term.onExit(({ exitCode }) => {
        this.children.delete(pid)
        this.runtime.dying.delete(exited)
        this.send({ type: 'exit', pid, code: exitCode })
        done()
      })
    })
    this.children.set(pid, { term, exited, owner: this })
    return null
  }

  /** 结束整个进程组（npm → sh → node），两秒内没退出就强制结束。 */
  kill(pid: number) {
    const child = this.children.get(pid)
    if (!child) return
    this.runtime.dying.add(child.exited)
    const signal = (name: NodeJS.Signals) => {
      try {
        process.kill(-child.term.pid, name)
      } catch {
        try { child.term.kill(name) } catch {}
      }
    }
    signal('SIGTERM')
    const timer = setTimeout(() => signal('SIGKILL'), 2000)
    void child.exited.then(() => clearTimeout(timer))
  }

  watch(wid: number, path: string, recursive: boolean) {
    const watcher = watch(this.path(path), { recursive }, (eventType, filename) => {
      if (filename) this.send({ type: 'watch', wid, eventType, filename: filename.split(sep).join('/') })
    })
    watcher.on('error', () => watcher.close())
    this.watchers.set(wid, watcher)
  }

  close() {
    for (const pid of this.children.keys()) this.kill(pid)
    for (const watcher of this.watchers.values()) watcher.close()
    this.watchers.clear()
  }
}

class Runtime {
  readonly sessions = new Set<Session>()
  readonly dying = new Set<Promise<void>>()
  private readonly open = new Set<number>()
  private timer: NodeJS.Timeout | undefined
  readonly options: RuntimeOptions

  constructor(options: RuntimeOptions) {
    this.options = options
  }

  /** 新页面接管工作区：结束所有进程，清空工作区。 */
  async claim(owner: Session) {
    for (const session of this.sessions) {
      if (session !== owner) session.close()
    }
    for (const pid of owner.children.keys()) owner.kill(pid)
    await this.settle()
    await rm(this.options.workspace, { recursive: true, force: true })
    await mkdir(this.options.workspace, { recursive: true })
  }

  async settle() {
    while (this.dying.size) await Promise.all(this.dying)
  }

  openPorts() {
    return [...this.open]
  }

  add(session: Session) {
    this.sessions.add(session)
    this.timer ??= setInterval(() => void this.probe(), 300)
  }

  remove(session: Session) {
    session.close()
    this.sessions.delete(session)
    if (!this.sessions.size) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  /** 预览端口能连上就算打开。WebContainer 自己会发 port 事件，本机只能轮询。 */
  private async probe() {
    for (const port of this.options.ports) {
      const up = await reachable(port)
      if (up === this.open.has(port)) continue
      if (up) this.open.add(port)
      else this.open.delete(port)
      for (const session of this.sessions) session.send({ type: 'port', port, open: up })
    }
  }

  shutdown() {
    for (const session of this.sessions) session.close()
  }
}

function reachable(port: number) {
  return new Promise<boolean>((done) => {
    const socket = createConnection({ port, host: '127.0.0.1' })
    socket.once('connect', () => { socket.destroy(); done(true) })
    socket.once('error', () => done(false))
    socket.setTimeout(250, () => { socket.destroy(); done(false) })
  })
}

/** 把目录打成 zip（DownloadButton 用）。 */
async function zip(root: string, excludes: Set<string>) {
  const files: Array<{ name: string, data: Buffer }> = []
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (excludes.has(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile()) files.push({ name: relative(root, full).split(sep).join('/'), data: await readFile(full) })
    }
  }
  await walk(root)
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name)
    const packed = deflateRawSync(data)
    const crc = crc32(data)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0x0800, 6) // UTF-8 文件名
    header.writeUInt16LE(8, 8) // deflate
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(packed.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(nameBytes.length, 26)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(0x0800, 8)
    entry.writeUInt16LE(8, 10)
    entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(packed.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(nameBytes.length, 28)
    entry.writeUInt32LE(offset, 42)
    local.push(header, nameBytes, packed)
    central.push(entry, nameBytes)
    offset += header.length + nameBytes.length + packed.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, directory, end])
}

/** 在 HTTP 服务器上挂运行时的 WebSocket 入口。返回关闭函数。 */
export function attachRuntime(server: Server, options: RuntimeOptions) {
  const runtime = new Runtime({ ...options, workspace: resolve(options.workspace) })
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 })

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (new URL(request.url ?? '/', 'http://localhost').pathname !== RUNTIME_PATH) return
    if (!isLocal(request)) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')
      return
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      const session = new Session(runtime, ws)
      runtime.add(session)
      ws.on('message', (raw) => {
        let message: { id: number, op: string, args: Record<string, any> }
        try {
          message = JSON.parse(String(raw))
        } catch {
          return
        }
        session.handle(message.op, message.args ?? {}).then(
          result => session.send({ id: message.id, result }),
          (error: NodeJS.ErrnoException) => session.send({ id: message.id, error: { message: error.message, code: error.code } }),
        )
      })
      ws.on('close', () => runtime.remove(session))
    })
  })

  const shutdown = () => runtime.shutdown()
  server.on('close', shutdown)
  process.once('exit', shutdown)
  return shutdown
}
