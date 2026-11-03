import { Context } from '@deepseek-ai/cordis'
import { draw } from './harness/index.ts'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'demo/transform'(input: string, next: () => Promise<string>): Promise<string>
  }
}

const ctx = new Context()
draw(ctx) // 把这个根交给流程图

// 监听器 1：调用 next() 交给下游，在返回路上把结果转成大写。
ctx.on('demo/transform', async (input, next) => {
  console.log('  监听器 1 进入')
  const downstream = await next()
  console.log('  监听器 1 拿到下游结果：', downstream)
  return downstream.toUpperCase()
})

// TODO：注册监听器 2。输入包含 "blocked" 时不调用 next()，直接返回 '** blocked **'；否则 return next()。

for (const input of ['hello', 'blocked words']) {
  console.log(`waterfall("${input}")`)
  const result = await ctx.waterfall('demo/transform', input, async () => {
    console.log('  默认逻辑运行')
    return input
  })
  console.log('  结果：', result)
}
