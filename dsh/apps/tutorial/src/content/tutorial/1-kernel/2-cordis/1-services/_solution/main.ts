import { Context } from '@deepseek-ai/cordis'
import { draw, settle, stateOf } from './harness/index.ts'
import { GreeterService } from './greeter.ts'

// 消费方：声明依赖 greeter 服务。
const consumer = {
  name: 'consumer',
  inject: ['greeter'],
  apply(ctx: Context) {
    console.log('consumer 运行 apply：', ctx.greeter.greet('world'))
  },
}

const root = new Context()
draw(root) // 把这个根交给流程图
const fiber = root.plugin(consumer)
await settle()
console.log('只挂了消费方：', stateOf(fiber))

const provider = root.plugin(GreeterService)
await settle()
console.log('挂上提供方后：', stateOf(fiber))

await provider.dispose()
await settle()
console.log('卸载提供方后：', stateOf(fiber))
