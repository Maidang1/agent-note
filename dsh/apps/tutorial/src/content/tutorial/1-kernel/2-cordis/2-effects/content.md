---
type: lesson
title: effect：注册即可撤销
focus: /main.ts
---

# effect：注册即可撤销

dsh 要支持卸载、替换和热重载，前提是插件做过的每一次注册都能原样撤销。否则卸载后会留下悬挂的监听器、过期的工具和还在跑的定时器。

Cordis 把“插件对外部世界产生的影响”统一建模为 **effect**：effect 主体在加载时运行，返回的 disposer 在卸载时运行。

## 现在的情况

`heartbeat` 插件做了两件事：用 `ctx.on()` 注册一个监听器，用 `setInterval()` 开一个定时器。卸载它之后，终端打印：

```text
heartbeat 收到 ping
heartbeat 状态： disposed
卸载后定时器还在跑：泄漏了
```

流程图上，`heartbeat` 在 L3，最后的状态是“已卸载”。图只能告诉你 fiber 已经结束，看不到 Cordis 不知道的资源，所以这一课要看终端（流程图右上角的按钮打开）。

监听器干净地移除了，第二次 `emit` 没有输出；定时器却还在跑。区别在于 `ctx.on()` 本身就是 effect，而 `setInterval()` 是 Cordis 不知道的资源。

## 动手

把定时器包进 `ctx.effect()`，在返回的 disposer 里清掉它：

```ts
ctx.effect(() => {
  timer = setInterval(() => ticks++, 10)
  return () => {
    clearInterval(timer)
    console.log('heartbeat cleaned up')
  }
})
```

再运行，输出变成：

```text
heartbeat 收到 ping
heartbeat cleaned up
heartbeat 状态： disposed
卸载后定时器已经停止
```

## dsh 里为什么很少写清理代码

Cordis 和 dsh 自带的注册 API 本身就是 effect：

- `ctx.on(event, listener)` 注册的监听器在卸载时移除；
- `ctx.plugin(child)` 挂载的子插件随父插件卸载；
- `ctx.tools.register(...)`、`ctx.systemPrompt.section(...)` 这类 dsh 注册表方法，会把 disposer 挂到调用方插件上。

所以上一章的 `calculator` 插件没有一行清理代码，卸载时工具照样会注销。上游把它定为仓库约定：每一项贡献都经过 `ctx.effect()` 或 `ctx.on()`，每个注册表贡献都要有“dispose fiber 后观察到注册被移除”的测试。

有一处容易踩坑：disposer 按注册的逆序启动，但多个**异步** disposer 会并发执行。拆除步骤有先后要求时，应当放进同一个 disposer 里依次 await。
