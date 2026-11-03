import { Context } from '@deepseek-ai/cordis'
import { draw, settle, stateOf } from './harness/index.ts'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'demo/ping'(): void
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
let ticks = 0
let timer: ReturnType<typeof setInterval> | undefined

function heartbeat(ctx: Context) {
  // ctx.on() 本身就是 effect：插件卸载时监听器自动移除。
  ctx.on('demo/ping', () => console.log('heartbeat 收到 ping'))

  // 定时器不是 Cordis 管理的资源，要显式包进 ctx.effect()。
  ctx.effect(() => {
    timer = setInterval(() => ticks++, 10)
    return () => {
      clearInterval(timer)
      console.log('heartbeat cleaned up')
    }
  })
}

const root = new Context()
draw(root) // 把这个根交给流程图
const fiber = root.plugin(heartbeat)
await settle()
root.emit('demo/ping')

await fiber.dispose()
console.log('heartbeat 状态：', stateOf(fiber))
root.emit('demo/ping') // 监听器已经移除，这里没有输出

const before = ticks
await sleep(100)
console.log(ticks > before ? '卸载后定时器还在跑：泄漏了' : '卸载后定时器已经停止')

clearInterval(timer) // 兜底，让进程能退出
