---
type: lesson
title: 工具流水线：谁可以说不
focus: /policy.ts
---

# 工具流水线：谁可以说不

模型请求一次工具调用后，`ctx.tools.execute()` 不会立刻运行工具本体，而是先让这次调用走完一条流水线：

```text
tools/pre-execute  (waterfall)  allow / deny / ask / cancel
guard              (同步检查)    返回字符串即拒绝
tools/execute      (waterfall)  包住工具本体：超时、重试、计量
tools/post-execute (waterfall)  accept（可改写内容）/ block
tools/result       (emit)       只观察
```

每个阶段回答的问题不同：能不能跑，怎么跑，结果给模型看什么，最后发生了什么。

流程图的“数据流”视图里，这条流水线就是 `响应 #n · 调用 add(…)` 之后由 `tools` 发出的那几步，`policy` 监听的步骤会指向它。`检查点 …` 是 `policy.ts` 里 `checkpoint()` 打的点，出现在发出它的插件上。

## 读懂 `policy.ts`

- **pre-execute**：监听器不调用 `next()`，直接返回 `{ kind: 'allow' }`，相当于宣布“全部放行”。真实场景里，审批插件在这里返回 `ask`，让用户确认。
- **post-execute**：把工具结果改写成 `add 返回 5`。请求 #2 里模型看到的就是改写后的文本。它也可以返回 `{ kind: 'block', feedback }`，把成功的结果变成一条纠错信息。
- **result**：`emit` 事件，监听器的返回值被忽略，抛出的错误只记一条警告。适合做审计和计量，不能用来改结果。

## 动手：加一个 guard

在 TODO 处注册 guard：

```ts
ctx.tools.guard((exec) => {
  const { a } = exec.arguments as { a: number }
  if (exec.name === 'add' && a > 100) return '数字太大，拒绝执行'
})
```

再看第二轮：

```text
[checkpoint] pre-execute  {"tool":"add","arguments":{"a":200,"b":1}}
[checkpoint] result  {"tool":"add","isError":true}
[request] #4  tools: add
    最后一条消息（tool）
    │ Error: 数字太大，拒绝执行
```

“注册”视图里，`policy → tools` 多了一条 `guard()`。回放第二轮，`tools/pre-execute · add` 之后直接是 `tools/post-execute · add`，`tools/execute` 那一步没有了：工具本体从未运行。

pre-execute 明确返回了 `allow`，guard 照样拒绝了。拒绝原因作为一条错误的工具结果回到模型，轮次没有中断，模型可以换个做法。

## 为什么要有两层

`tools/pre-execute` 是 waterfall：后注册的监听器在内层，外层的监听器可以不调用 `next()` 直接返回结果，内层的决定就被跳过了。这让它足够灵活，审批、改道、按会话放行都可以做，代价是任何一个插件都能覆盖别人的决定。就像这一课的“放行一切”监听器。

guard 是**单调**的：上游在 pre-execute 返回 `allow` 之后，才检查全部 guard，任何一个返回字符串就拒绝，没有哪个 guard 能把别人拒绝的调用改成允许。所以真正的安全底线（比如不许写仓库之外的路径）放在 guard 里，交互式的策略放在 pre-execute 里。

```js
const denialReason = decision.kind === 'allow' ? this.guardReason(exec) : decision.reason
```

（节选自上游 dsh-tools。）guard 还是同步函数，只看参数，不能等待异步结果，这让它便宜，也难以被绕过。

和其他注册一样，`guard()` 返回 disposer。通过 `agent.ctx` 注册的 guard 只对那个 agent 生效。“插件实战”部分的工具守卫插件会演示怎样让一整套策略只对某个 agent 生效。
