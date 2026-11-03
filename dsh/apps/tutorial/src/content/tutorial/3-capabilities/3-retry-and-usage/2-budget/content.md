---
type: lesson
title: token 预算：超了就停
focus: /budget.ts
terminal:
  open: true
  activePanel: 0
  panels: [['output', '输出'], ['terminal', '终端']]
---

# token 预算：超了就停

上一课的重试让 agent 更耐用，也意味着它能花更多钱。这一课给会话加一道成本熔断：用掉的 token 超过预算，就不再请求模型。

脚本模型现在能报告用量：规则上写 `usage: { input, output }`，适配器在 `finish` 之前发出一个 `usage` chunk，和真实提供方一样。这一课的模型停不下来：每次拿到工具结果都再调用一次 `add`，一共 6 次，每次报告输入 1200、输出 50。

## 谁在数 token

`main.ts` 挂上了上游的 [`dsh-token-meter`](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/llm/token-meter/README.zh.md)。它不调用模型，也不加任何模型可见的内容，只从会话日志里折叠出几个投影。其中 `tokenUsage` 把每次成功响应里提供方报告的用量累加起来：

```text
会话总用量： {
  uncachedInputTokens: 8400,
  outputTokens: 320,
  cacheReadTokens: 0,
  cacheWriteTokens: 0
}
```

四个桶分开记，因为它们价格不同：命中缓存的输入（`cacheReadTokens`）通常比未命中的便宜很多。

`budget.ts` 在每一步开始前读这个投影：

```ts
const usage = ctx.sessionProjections.stateOf(payload.agent.session, 'tokenUsage')
```

它注入了 `tokenMeter`。`budget` 并不调用这个服务，注入是为了声明依赖：`tokenUsage` 投影是 token-meter 注册的，没有它，读到的投影不存在。流程图的“依赖”视图里，`budget` 有一条虚线指向 `token-meter`。

## 现在的情况

展开终端：

```text
  步骤 3 开始前：已用 2500 tokens
[response] #3  调用 add({"a":1,"b":1})
  步骤 4 开始前：已用 3750 tokens
[response] #4  调用 add({"a":1,"b":1})
…
[response] #7  验算完了，等于 2
[turn] [s] 轮次结束  completed
```

预算是 3000，用到了 8720。插件看见了，但只是打印。

## 动手

在 TODO 处，超出预算就拒绝这一步：

```ts
if (used > config.maxTokens) return { kind: 'reject' }
```

再运行：

```text
  步骤 4 开始前：已用 3750 tokens
[turn] [s] 轮次结束  blocked
```

只有 3 次请求。回放这一轮，最后一个 `agent/pre-step` 之后直接是 `session/event · turn/end`，没有 `请求 #4`。

## 为什么放在 pre-step

“pre-step：接纳还是拒绝”一课里，拒绝的理由是消息内容；这里是花费。`agent/pre-step` 是每次请求模型之前的最后一个决策点，在这里拒绝，就一定不会再多花一次调用。

预算查的是“已用”，不是“这次会用多少”：步骤 4 开始前已经超了才停，所以实际花费会超出预算最多一步的量。要提前停，可以用 token-meter 的另一个投影 `contextPressure`：它有 `projectedTokens`，估算下一个请求的提示词有多大。

`tokenUsage` 是整个会话的累计，跨轮次不清零：这道熔断管的是会话总花费。只想限制单轮，可以在 `turn/start` 时记下当时的用量，每步比较差值。

还有两点和上一章有关：

- 用量来自日志，所以会话恢复后预算照样生效，不会因为重启从零算起。
- 上游 README 说明，`llm/retry-started` 会结束一次尝试的用量替换范围，所以同一步里重试的每一次尝试都会单独计费。失败的请求同样花钱。
