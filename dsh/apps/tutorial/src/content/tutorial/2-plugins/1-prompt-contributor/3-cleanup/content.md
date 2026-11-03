---
type: lesson
title: 卸载即清理
focus: /contributor.ts
---

# 卸载即清理

`main.ts` 挂载插件、发一条消息，卸载插件、再发一条，最后重新挂载。期望是：卸载之后片段消失，重新挂载一切如初。

实际输出：

```text
[user] [s] 卸载之后
    system
    │ 你是一个助手
    │
    │ 回答时使用短句
重新挂载失败： prompt section "lesson:style" is already registered ...
```

插件卸载了，它贡献的片段还在；再挂一次，同名片段冲突。

流程图上 L3 有两个 `prompt-contributor`：第一个“已卸载”，重新挂载的那个“失败”。“注册”视图里一条 `section()` 都没有：片段不是这个插件注册的。

## 原因：注册归谁所有

`contributor.ts` 从 `ctx.root` 上拿服务，再调用 `section()`。看起来是同一个注册表，区别在于**调用方是谁**。

dsh 的每个注册方法都把注册动作包进调用方 context 的 Cordis effect。上游 `dsh-scope` 里的 `ScopedLayers.effect()` 是这样注释的：

```js
/**
 * @param ctx - context that determines both scope visibility and effect ownership.
 * @returns the exact disposer returned by `ctx.effect()`.
 */
```

通过 `ctx.root.systemPrompt` 调用，调用方就是根 context，片段归根所有，要等整个应用关闭才会撤销。插件卸载时，Cordis 只撤销**插件自己的** effect，这个片段不在其中。

## 动手

改成通过插件自己的 `ctx` 注册：

```ts
ctx.systemPrompt.section({ name: 'lesson:style', order: 100, text: '回答时使用短句' })
```

卸载之后片段消失，重新挂载成功。“注册”视图里，重新挂载的 `prompt-contributor` 有了自己的 `section()`；回放到第一个实例卸载的那一帧，它的 `section()` 跟着消失。插件里一行清理代码都没有写。

这就是 dsh 热重载不留残渣的原因：改了 `cordis.yml` 里的一行，Cordis 卸载旧实例、挂载新实例，旧实例注册过的片段、变量、工具、guard、事件监听器全部随之撤销。前提是插件从不“越过”自己的 `ctx` 去注册东西。

同一个注释的前半句“scope visibility”是下一课的主题：注册所用的 context 还决定了它对谁可见。
