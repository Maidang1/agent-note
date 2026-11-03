---
type: lesson
title: 服务与 inject
focus: /main.ts
---

# 服务与 inject

dsh 的所有插件都建立在 [Cordis](https://github.com/cordiverse/cordis) 之上。上游的 Cordis 入门把它归纳成五个概念：插件与 fiber、effect、服务与 inject、类型化事件、作用域。这一章用三课把前四个跑一遍。

这一课不挂 dsh 内核，只用 `@deepseek-ai/cordis` 本身。`main.ts` 用 `draw(root)` 把自己建的根交给流程图，所以右边画的是这个裸的 Cordis 根。

## 插件与 fiber

插件可以是一个带 `apply(ctx)` 的对象，也可以是 `Service` 子类。`ctx.plugin(plugin)` 挂载它，返回一个 **fiber**，即这个插件实例的运行时句柄。fiber 在这些状态之间转换：

```text
PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED
                 ↘ FAILED
```

PENDING 表示已经声明，但所需的服务还不可用。

## 服务：按名字找能力

`greeter.ts` 里的 `GreeterService` 是一个服务。有两层机制：

- **运行时**：`super(ctx, 'greeter')` 把实例注册到 `ctx.greeter`；
- **编译时**：`declare module` 把 `greeter` 加进 `Context` 接口，`ctx.greeter` 因此有类型。它不生成代码。

`main.ts` 里的 `consumer` 用 `inject: ['greeter']` 声明依赖。现在终端打印的是：

```text
只挂了消费方： pending
```

没有人提供 `greeter`，消费方就一直等，不报错也不输出。插件“没反应”时，第一件事是看它的 fiber 状态。

流程图上，`consumer` 在 L3，状态是“等待依赖”，副标题写着“等待 greeter”。它只依赖服务、自己不提供服务，所以落在 L3。

## 动手

1. 用 `root.plugin(GreeterService)` 挂上提供方，`await settle()` 后再打印消费方的状态；
2. 用 `await provider.dispose()` 卸载提供方，再打印一次。

你会看到：

```text
consumer 运行 apply： Hello, world!
挂上提供方后： active
卸载提供方后： pending
```

点“回放”看这个过程：`GreeterService` 出现在 L1，`consumer` 变成“已激活”，“依赖”视图里多了一条 `consumer → greeter` 的虚线；提供方卸载后，`GreeterService` 变成“已卸载”，这条线跟着消失，`consumer` 回到“等待依赖”。

`inject` 不是一次性的启动检查。服务消失时，依赖它的插件跟着卸载，回到 PENDING；服务恢复后再重新加载。消费方因此不会持有一个已经失效的服务引用。

这就是“从配置替换提供方”的底层原理：卸载一个提供 `shell` 服务的插件、挂上另一个，所有注入了 `shell` 的插件都会重启并用上新实现。

> `settle()` 是课程运行器提供的小工具，它让出几次事件循环，等 Cordis 跑完激活和卸载链。
