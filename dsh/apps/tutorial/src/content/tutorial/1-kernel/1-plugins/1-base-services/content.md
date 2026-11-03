---
type: lesson
title: 从一个空的根开始
focus: /main.ts
---

# 从一个空的根开始

上一部分用的是一个装好的 agent。这一部分把它拆开，看 dsh 是怎么一块块拼起来的。dsh 的 README 第一句是：

> It is built on an **everything-is-a-plugin** architecture and powered by Cordis.
>
> （它建立在“一切皆插件”的架构上，底层是插件框架 Cordis。）

“一切皆插件”的意思是：模型适配器、工具注册表、会话日志，连 agent loop 本身都是插件。没有需要打补丁的特权内核，扩展 dsh 的方式是把插件挂到其他插件旁边。

这一章不直接给你一个现成的内核，而是从一个空的 Cordis 根开始，一层一层把它挂出来。右侧下方的**流程图**跟着你的代码画：挂上一个插件，图上就多一个节点；插件之间有了依赖和注册，图上就多一条线。

## 流程图怎么读

图分五层，从上到下：

| 层 | 放什么 |
|---|---|
| L0 根作用域 | Cordis 的根 `new Context()`，所有插件都挂在它下面 |
| L1 基础服务 | 提供服务、自己不依赖其他服务的插件 |
| L2 能力 | 依赖基础服务的服务（工具运行时），以及模型适配器 |
| L3 扩展 | 不提供服务，只往下层服务里贡献内容的插件 |
| L4 编排 | agent loop：依赖几乎所有服务，驱动一轮对话 |

表里的**服务**是插件对外提供的一组功能，挂在 `ctx` 上，比如 `session` 插件提供 `ctx.sessions`，别的插件按名字使用它。每个节点上写着它提供或依赖的服务和当前状态。图上的一切都是运行时读出来的：节点是 Cordis 里正在运行的插件实例（Cordis 叫它 fiber），连线来自插件声明的依赖和它注册的东西，不是预先画好的。

上一部分只看了“数据流”视图。这一部分还会用到另外两个：“依赖”画出插件需要谁，“注册”画出插件往谁那里放了东西。“回放”从第一帧开始重放这次运行，你能看到节点一个个出现、从“启动中”变成“已激活”。

## 现在的情况

`main.ts` 用 `createHarness({ kernel: [] })` 建了一个空的根，然后只挂了一个插件：

```ts
await harness.plugin(kernel['session'])
```

流程图上，L0 有一个 `root`，L1 只有 `session`，它提供 `sessions` 服务。终端里是这一行：

```text
[plugin] SessionStore  active
```

`SessionStore` 是这个插件的名字（Cordis 里的 `name`），`active` 表示它已经激活，服务可以用了。

## 挂上其余的基础服务

把 TODO 换成四行，挂上其余四个基础服务：

```ts
await harness.plugin(kernel['session-projection'])
await harness.plugin(kernel['agent'])
await harness.plugin(kernel['system-prompt'])
await harness.plugin(kernel['llm'])
```

保存后程序自动重新运行，L1 那一层被填满了：

| 插件 | 提供的服务 | 职责 |
|---|---|---|
| `dsh-session` | `ctx.sessions` | 仅追加的会话日志，唯一真源 |
| `dsh-session-projection` | `ctx.sessionProjections` | 从日志派生给 UI 和插件用的状态 |
| `dsh-agent` | `ctx.agents` | `Agent` 接口与活跃 agent 注册表 |
| `dsh-system-prompt` | `ctx.systemPrompt` | 提示词片段与工具 schema 的组装 |
| `dsh-llm` | `ctx.llm` | 消息词汇与模型适配器 seam |

它们都是 npm 上发布的 `@deepseek-ai/dsh-*@0.2.1-rc.2`，原样挂载。五个插件都没有 `inject`，所以挂上就能激活，挂载顺序也无所谓。切到“依赖”视图，这一层之间一条线也没有。

这还不是一个能对话的内核：没有工具运行时，没有模型，也没有驱动对话的循环。接下来三课依次把 L2、L4 和 L3 画出来。
