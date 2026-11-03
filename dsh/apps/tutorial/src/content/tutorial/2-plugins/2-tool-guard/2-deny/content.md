---
type: lesson
title: 短路拒绝
focus: /tool-guard.ts
---

# 短路拒绝

插件现在有了配置 `deny`：要拒绝的工具名列表。`main.ts` 用 `{ deny: ['add'] }` 挂载它，但 policy 层还没有用上这个配置，`add` 照样执行，结果是 `3`。

## 动手

在 TODO 处，工具名在 `deny` 里时直接返回拒绝，不调用 `next()`：

```ts
if (deny.has(exec.name)) return { kind: 'deny', reason: `${exec.name} is blocked by policy` }
```

再看检查点：

```text
[checkpoint] audit-enter   {"tool":"add"}
[checkpoint] policy-enter  {"tool":"add"}
[checkpoint] audit-return  {"tool":"add","decision":"deny"}
[checkpoint] post-execute  {"tool":"add","isError":true}
```

- 没有 `policy-return`：policy 层没调用 `next()`，自己的返回路上的检查点也就没有执行。
- 默认决定没有产生，工具本体没有运行。
- 外层审计层的 `await next()` 拿到的是 `deny`，审计记录照样完整。
- 拒绝变成一条 `isError` 的工具结果，仍然经过 `tools/post-execute`（`main.ts` 里的观察者看到了它），然后回到模型：`Error: add is blocked by policy`。

回放这一步，`检查点 audit-return` 之后直接是 `tools/post-execute · add`，`tools/execute` 那一步消失了。

拒绝不是异常，轮次没有中断。模型看到原因，可以换一种做法。

## 返回值的四种决定

`tools/pre-execute` 的返回值有四种：`allow` 放行；`deny` 拒绝并给出原因；`cancel` 当作调用被取消；`ask` 请审批服务向用户确认，用户同意才放行。dsh 的权限插件就是在这条链上返回 `ask` 的。

还记得“内核架构”部分的工具流水线一课吗？waterfall 上的拒绝可以被更外层的监听器绕过：外层直接返回 `allow`，不调用 `next()`，内层的 policy 就根本没有机会运行。需要真正兜底的规则，用单调的 `ctx.tools.guard()`。
