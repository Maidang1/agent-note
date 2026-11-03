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

// TODO 1：挂载 GreeterService，再打印 consumer 的状态
// TODO 2：卸载 GreeterService（await provider.dispose()），再打印一次
