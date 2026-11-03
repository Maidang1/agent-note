---
type: lesson
title: 两层监听器
focus: /tool-guard.ts
---

# 两层监听器

这一章写一个工具守卫插件：审计每一次工具调用，按配置拒绝某些工具，最后只对某个 agent 生效。

模型请求调用 `add` 后，Tools 服务在运行工具本体之前，先让调用走一遍 `tools/pre-execute`。`tool-guard.ts` 已经在上面挂了一层审计监听器：进入时打一个检查点，调用 `next()` 把决定交给内层，拿到决定后再打一个检查点。最内层是默认决定 `allow`。

```text
[checkpoint] audit-enter   {"tool":"add"}
[checkpoint] audit-return  {"tool":"add","decision":"allow"}
```

流程图上，`tool-guard` 在 L3，“注册”视图里有一条 `on tools/pre-execute` 指向 `tools`。回放到 `tools/pre-execute · add`，下一步就是 `tool-guard` 上的 `检查点 audit-enter`。

## 动手：再加一层

照着审计层，在 TODO 处注册一层 policy：

```ts
ctx.on('tools/pre-execute', async (exec, next) => {
  checkpoint(ctx, 'policy-enter', { tool: exec.name })
  const decision = await next()
  checkpoint(ctx, 'policy-return', { tool: exec.name, decision: decision.kind })
  return decision
})
```

检查点的顺序变成：

```text
audit-enter → policy-enter → policy-return → audit-return
```

后注册的监听器在里层，这就是“内核架构”部分的 Cordis 课程里的洋葱模型，只是这次跑在真实的工具流水线上。`checkpoint()` 是本教程约定的辅助函数，不是上游 API，它只发一个事件，终端按发生顺序打印，流程图把它画成发出它的插件上的一步。

审计层放在最外面，因为它要看到**最终**决定：无论里面哪一层做出了决定，返回路上都会经过它。下一课让 policy 层真的做一次决定。
