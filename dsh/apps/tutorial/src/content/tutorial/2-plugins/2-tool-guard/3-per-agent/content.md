---
type: lesson
title: 只限制一个 agent
focus: /main.ts
---

# 只限制一个 agent

现在两个会话的 `add` 都被拒绝了，因为插件挂在根上。如果只想限制 `strict` 这一个 agent 呢？

插件本身不用改。上一章用 `agentCtx` 注册了一个提示词片段，这一次把**整个插件**挂到 `agentCtx` 下。

## 动手

删掉根上的挂载，改在 `strict` 的 setup 里挂：

```ts
await harness.agent('strict', async (agentCtx: Context) => {
  await agentCtx.plugin(toolGuard, { deny: ['add'] })
})
```

结果：

```text
[s] 工具结果：3
[strict] 工具结果：Error: add is blocked by policy
```

回放两轮：第一轮（会话 `s`）的 `tools/pre-execute · add` 之后直接是 `tools/execute`，第二轮（会话 `strict`）才有 `tool-guard` 的检查点。流程图上 `tool-guard` 现在是 `agent strict` 作用域里的插件，`strict` 销毁后它也变成“已卸载”。

会话 `s` 的调用连审计检查点都没有：插件的监听器根本没有收到它的事件。

## 为什么插件不用改

插件里的 `ctx.on('tools/pre-execute', ...)` 用的是插件自己的 `ctx`。挂在 `agentCtx` 下时，这个 `ctx` 就是 agent 作用域的子 context。Tools 服务派发事件时，以发起调用的 agent 为目标：

```js
const gate = await this.ctx.waterfall(carrier, 'tools/pre-execute', exec, ...)
// carrier = scopeTarget(this, exec.agent)
```

（节选自上游 dsh-tools。）只有挂在这个 agent 作用域里或全局的监听器会收到事件。所以同一个插件，挂在根上就是全局策略，挂在 `agentCtx` 下就是这个 agent 的策略。`setup` 里 `await` 的子插件在 agent 发布之前就已激活，第一次工具调用时策略已经生效。agent 销毁时，子插件随之卸载。

这也是 agent preset 的工作方式：在配置里为一类 agent 列出一组插件，挂在每个 agent 自己的作用域下。

插件作者写的始终是“对我的 `ctx` 生效”的代码；它对谁生效，由挂载它的人决定。
