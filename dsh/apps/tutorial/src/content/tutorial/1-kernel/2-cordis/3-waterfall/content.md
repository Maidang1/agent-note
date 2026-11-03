---
type: lesson
title: waterfall：环绕中间件
focus: /main.ts
terminal:
  open: true
  activePanel: 0
  panels: [['output', '输出'], ['terminal', '终端']]
---

# waterfall：环绕中间件

服务适合直接调用；事件让插件在不知道谁在听的情况下发出通知或征求意见。Cordis 的每个事件有且只有一种分发模式，分发模式是事件公开约定的一部分：

| 模式 | 调用 | 语义 |
|---|---|---|
| emit | `ctx.emit(name, ...args)` | 同步广播，不等待、不收集返回值 |
| parallel | `await ctx.parallel(name, ...args)` | 所有监听器并发运行并一起等待 |
| serial | `await ctx.serial(name, ...args)` | 按注册顺序依次 await，第一个非空返回值胜出 |
| bail | `ctx.bail(name, ...args)` | serial 的同步版本 |
| waterfall | `ctx.waterfall(name, ...args, next)` | 环绕中间件 |

dsh 内核里需要“多方协作做一个决策”的地方几乎都是 waterfall：`agent/pre-step`、`agent/request`、`llm/stream`、`system-prompt/assemble`、`tools/pre-execute` 等。

## waterfall 的规则

每个监听器拿到参数和一个 `next()`：

- 调用 `next()` 执行下游监听器，最内层是分发方传入的默认逻辑。下游的返回值经 `next()` 回到当前层，当前层可以改写后再返回；
- 不调用 `next()` 直接返回，就**短路**了后面所有逻辑。

这一课的监听器直接注册在根上，没有挂任何插件，所以流程图上只有 L0 的 `root`。输出都在终端里，这一课的终端默认打开。

现在只有监听器 1，它包装下游结果。两次调用都走到了默认逻辑，结果是 `HELLO` 和 `BLOCKED WORDS`。

## 动手

注册监听器 2：输入包含 `blocked` 时不调用 `next()`，直接返回 `'** blocked **'`，否则 `return next()`。

```ts
ctx.on('demo/transform', async (input, next) => {
  console.log('  监听器 2 进入')
  if (input.includes('blocked')) return '** blocked **'
  return next()
})
```

第二次调用的输出会变成：

```text
waterfall("blocked words")
  监听器 1 进入
  监听器 2 进入
  监听器 1 拿到下游结果： ** blocked **
  结果： ** BLOCKED **
```

后注册的监听器在里层。监听器 2 没有调用 `next()`，默认逻辑从未运行；返回途中，监听器 1 仍然把替换结果转成了大写。

## 一条事件纪律

这带出 dsh 最重要的一条事件纪律，写在上游仓库根目录的约定里：**只做观察或标注的 waterfall 监听器必须调用 `next()`**。日志插件忘记调用 `next()`，会悄悄吞掉下游的全部默认行为，而编译器不会报错。

“插件实战”部分的“工具守卫插件”一章会在真实的 `tools/pre-execute` 上重复这个实验。
