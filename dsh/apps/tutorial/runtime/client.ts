/// <reference lib="dom" />
/**
 * `@webcontainer/api` 的本机替身，由 astro.config.ts 用 Vite 别名换进 TutorialKit。
 *
 * 只实现 TutorialKit 1.6 用到的部分：boot、mount、fs（读写、列目录、建删、监听）、
 * spawn、port 事件和 export。所有操作经 WebSocket 交给本机的运行时（server.ts）执行。
 */

type Listener = (...args: any[]) => void

interface Reply {
  id?: number
  result?: any
  error?: { message: string, code?: string }
  type?: 'output' | 'exit' | 'port' | 'watch'
  pid?: number
  data?: string
  code?: number
  port?: number
  open?: boolean
  wid?: number
  eventType?: 'change' | 'rename'
  filename?: string
}

const PATH = '/__lesson-runtime'

function toBase64(bytes: Uint8Array) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}

function fromBase64(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function encode(data: string | Uint8Array) {
  return typeof data === 'string' ? data : { base64: toBase64(data) }
}

/** 运行时不可用时在页面顶部显示原因；TutorialKit 自己只会在收起的终端里提示 WebContainer 被拦截。 */
function showProblem(message: string) {
  let banner = document.getElementById('lesson-runtime-problem')
  if (!banner) {
    banner = document.createElement('div')
    banner.id = 'lesson-runtime-problem'
    banner.setAttribute('role', 'alert')
    banner.style.cssText = 'position:fixed;inset:0 0 auto 0;z-index:1000;padding:10px 16px;background:#b42318;color:#fff;font:14px/1.5 system-ui,sans-serif;text-align:center'
    document.body.append(banner)
  }
  banner.textContent = message
}

class Connection {
  private next = 1
  private readonly pending = new Map<number, { resolve: (value: any) => void, reject: (error: Error) => void }>()
  readonly listeners = new Set<(reply: Reply) => void>()

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const reply = JSON.parse(String(event.data)) as Reply
      if (reply.id === undefined) {
        for (const listener of this.listeners) listener(reply)
        return
      }
      const waiter = this.pending.get(reply.id)
      if (!waiter) return
      this.pending.delete(reply.id)
      if (reply.error) waiter.reject(Object.assign(new Error(reply.error.message), { code: reply.error.code }))
      else waiter.resolve(reply.result)
    })
    socket.addEventListener('close', () => {
      const error = new Error('本机运行时的连接断开了，请确认 pnpm start 或 pnpm dev 仍在运行，然后刷新页面。')
      for (const waiter of this.pending.values()) waiter.reject(error)
      this.pending.clear()
      for (const listener of this.listeners) listener({ type: 'exit', pid: -1, code: 1 })
      console.error(error.message)
      showProblem(error.message)
    })
  }

  static open() {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${PATH}`
    return new Promise<Connection>((resolve, reject) => {
      const socket = new WebSocket(url)
      socket.addEventListener('open', () => resolve(new Connection(socket)), { once: true })
      socket.addEventListener('error', () => {
        const message = '连不上本机运行时。这个页面可能来自 astro preview 或其他静态服务器；请结束它，用 pnpm start 或 pnpm dev 启动后刷新页面。'
        showProblem(message)
        reject(new Error(message))
      }, { once: true })
    })
  }

  call<T = any>(op: string, args: Record<string, unknown> = {}): Promise<T> {
    const id = this.next++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, op, args }))
    })
  }

  id() {
    return this.next++
  }
}

interface SpawnOptions {
  terminal?: { cols: number, rows: number }
  output?: boolean
}

class Process {
  readonly output: ReadableStream<string>
  readonly input: WritableStream<string>
  readonly exit: Promise<number>

  constructor(private readonly connection: Connection, readonly pid: number) {
    let controller!: ReadableStreamDefaultController<string>
    let finish!: (code: number) => void
    this.exit = new Promise(resolve => finish = resolve)
    this.output = new ReadableStream({ start: c => void (controller = c) })
    const listener = (reply: Reply) => {
      if (reply.type === 'output' && reply.pid === pid) controller.enqueue(reply.data!)
      if (reply.type === 'exit' && (reply.pid === pid || reply.pid === -1)) {
        connection.listeners.delete(listener)
        try { controller.close() } catch {}
        finish(reply.code ?? 1)
      }
    }
    connection.listeners.add(listener)
    this.input = new WritableStream({ write: data => connection.call('input', { pid, data }) })
  }

  kill() {
    void this.connection.call('kill', { pid: this.pid })
  }

  resize({ cols, rows }: { cols: number, rows: number }) {
    void this.connection.call('resize', { pid: this.pid, cols, rows })
  }
}

class Dirent {
  constructor(readonly name: string, private readonly file: boolean, private readonly directory: boolean) {}
  isFile() { return this.file }
  isDirectory() { return this.directory }
}

class FileSystem {
  constructor(private readonly connection: Connection) {}

  async readFile(path: string, encoding?: string | null) {
    const result = await this.connection.call('readFile', { path, encoding: encoding ?? undefined })
    return typeof result === 'string' ? result : fromBase64(result.base64)
  }

  async writeFile(path: string, data: string | Uint8Array, options?: string | { encoding?: string | null }) {
    void options
    await this.connection.call('writeFile', { path, data: encode(data) })
  }

  async readdir(path: string, options?: { withFileTypes?: boolean, encoding?: string }) {
    const entries = await this.connection.call<Array<{ name: string, file: boolean, directory: boolean }>>('readdir', { path })
    return options?.withFileTypes ? entries.map(entry => new Dirent(entry.name, entry.file, entry.directory)) : entries.map(entry => entry.name)
  }

  async mkdir(path: string, options?: { recursive?: boolean }) {
    await this.connection.call('mkdir', { path, recursive: options?.recursive })
    return options?.recursive ? path : undefined
  }

  async rm(path: string, options?: { force?: boolean, recursive?: boolean }) {
    await this.connection.call('rm', { path, ...options })
  }

  watch(path: string, options: { recursive?: boolean } | Listener, listener?: Listener) {
    const callback = typeof options === 'function' ? options : listener
    const wid = this.connection.id()
    const handler = (reply: Reply) => {
      if (reply.type === 'watch' && reply.wid === wid) callback?.(reply.eventType, reply.filename)
    }
    this.connection.listeners.add(handler)
    void this.connection.call('watch', { wid, path, recursive: typeof options === 'object' && !!options.recursive })
    return {
      close: () => {
        this.connection.listeners.delete(handler)
        void this.connection.call('unwatch', { wid })
      },
    }
  }
}

type Tree = Record<string, { file: { contents: string | Uint8Array } } | { directory: Tree } | { file: { symlink: string } }>

function encodeTree(tree: Tree): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [name, node] of Object.entries(tree)) {
    if ('directory' in node) result[name] = { directory: encodeTree(node.directory) }
    else if ('contents' in node.file) result[name] = { file: { contents: encode(node.file.contents) } }
  }
  return result
}

export class WebContainer {
  readonly fs: FileSystem
  private readonly listeners = new Map<string, Set<Listener>>()

  private constructor(private readonly connection: Connection, readonly workdir: string, ports: number[]) {
    this.fs = new FileSystem(connection)
    connection.listeners.add((reply) => {
      if (reply.type === 'port') this.port(reply.port!, reply.open!)
    })
    queueMicrotask(() => {
      for (const port of ports) this.port(port, true)
    })
  }

  static async boot(_options?: unknown) {
    const connection = await Connection.open()
    const { workdir, ports } = await connection.call<{ workdir: string, ports: number[] }>('boot')
    return new WebContainer(connection, workdir, ports)
  }

  private port(port: number, open: boolean) {
    const url = `${location.protocol}//${location.hostname}:${port}`
    for (const listener of this.listeners.get('port') ?? []) listener(port, open ? 'open' : 'close', url)
    if (open) for (const listener of this.listeners.get('server-ready') ?? []) listener(port, url)
  }

  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(listener)
    return () => this.listeners.get(event)?.delete(listener)
  }

  async mount(tree: Tree, options?: { mountPoint?: string }) {
    await this.connection.call('mount', { tree: encodeTree(tree), mountPoint: options?.mountPoint })
  }

  async spawn(command: string, args?: string[] | SpawnOptions, options?: SpawnOptions) {
    const list = Array.isArray(args) ? args : []
    const settings = Array.isArray(args) ? options : args
    const pid = this.connection.id()
    const process = new Process(this.connection, pid)
    await this.connection.call('spawn', { pid, command, args: list, terminal: settings?.terminal })
    return process
  }

  async export(path: string, options?: { format?: 'zip' | 'json' | 'binary', excludes?: string[] }) {
    if (options?.format && options.format !== 'zip') throw new Error('本机运行时只支持导出 zip')
    const { base64 } = await this.connection.call<{ base64: string }>('export', { path, excludes: options?.excludes })
    return fromBase64(base64)
  }

  teardown() {}
}

/** WebContainer 企业版的登录接口；本机运行不需要。 */
export const auth = {
  init: () => ({ status: 'authorized' as const }),
  on: (_event: string, _listener: Listener) => () => {},
  loggedIn: () => Promise.resolve(),
  startAuthFlow: (_options?: unknown) => {},
  logout: (_options?: unknown) => Promise.resolve(),
}

export function configureAPIKey(_key: string) {}

/** `@webcontainer/api/utils` 的 reloadPreview：重新加载预览 iframe。 */
export function reloadPreview(preview: HTMLIFrameElement) {
  // eslint-disable-next-line no-self-assign -- 重新赋值触发重新加载
  preview.src = preview.src
}
