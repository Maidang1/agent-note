import { Context, Service } from '@deepseek-ai/cordis'

// 编译时：通过声明合并让 ctx.greeter 有类型。它不生成任何代码。
declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}

// 运行时：super(ctx, 'greeter') 把实例注册为 ctx.greeter。
export class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')
  }

  greet(who: string) {
    return `Hello, ${who}!`
  }
}
