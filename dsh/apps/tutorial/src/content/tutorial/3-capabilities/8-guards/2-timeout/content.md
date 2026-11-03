---
type: lesson
title: 给工具设一个时间上限
focus: /main.ts
terminal:
  open: true
  activePanel: 0
  panels: [['output', '输出'], ['terminal', '终端']]
---

# 给工具设一个时间上限

有的工具会卡住：网络慢，服务器不回应。模型只能干等，整个轮次也跟着停在那里。

`fetch_ci_log` 下载 CI 日志要 2 秒，但它在定义里写了 `timeoutMs: 300`：这个工具最多只该跑 300 毫秒。

## 现在的情况

```text
[response] #1  调用 fetch_ci_log({"pr":42})
[response] #2  CI 全部通过，可以合并
工具结果： PR #42 的 CI 日志：全部通过
用了 2 秒
```

`timeoutMs` 写了，却没有起作用。工具定义上的 `timeoutMs` 只是一个声明，工具运行时自己不看它；要有插件去执行它。

## 动手

在 TODO 处挂上超时策略：

```ts
await harness.plugin(TimeoutPolicy)
```

再运行：

```text
[response] #1  调用 fetch_ci_log({"pr":42})
[response] #2  CI 日志下载超时了，我先评审代码，日志稍后再看
工具结果： Error: tool call timed out after 300ms （错误）
不到 1 秒就结束了
```

300 毫秒一到，下载停了，模型拿到一个超时错误，换了个做法。

## 策略做了什么

整个插件只有一个 `tools/execute` 监听器（节选自[上游 timeout-policy](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/guard/timeout-policy/src/index.ts#L56-L80)）：

```ts
ctx.on('tools/execute', async (exec, next): Promise<ToolExecutionResult> => {
  const timeoutMs = ctx.tools.get(exec.name, exec.agent)?.timeoutMs
  // A tool that declares no budget: no deadline, delegate unchanged.
  if (timeoutMs === undefined) return next()

  using d = deadline(exec.signal, timeoutMs, TOOL_TIMEOUT)
  const upstream = exec.signal
  exec.signal = d.signal
  try {
    const result = await next()
    if (timeoutOf(d.signal, TOOL_TIMEOUT) !== undefined) {
      return toolTimeoutResult(timeoutMs)
    }
    return result
  } finally {
    exec.signal = upstream
  }
})
```

1. 从工具表里读这个工具声明的 `timeoutMs`。没声明的工具原样放行。时间上限跟着工具定义走，策略不需要任何配置。
2. 造一个新信号：原来的 `exec.signal` 中止时它中止，300 毫秒到了它也中止。把它换到 `exec.signal` 上，再调用 `next()`。
3. 工具结束后，如果是自己的计时器触发的，就把结果换成 `Error: tool call timed out after 300ms`，标记为错误。
4. 最后把原来的信号换回去，后面的 `tools/post-execute` 监听器看不到这个临时信号。

第 3 步用错误码 `TOOL_TIMEOUT` 区分是谁触发的：如果是用户打断，原来的信号中止，结果不会被说成超时。

## 工具要接住信号

策略只能“请求”工具停下：它中止信号，然后等 `next()` 返回。能不能停，看工具自己。

把 `ci-log.ts` 里的 `await sleep(2000, exec.signal)` 改成 `await sleep(2000)`，再运行：

```text
工具结果： Error: tool call timed out after 300ms （错误）
用了 2 秒
```

结果还是超时错误，但整整等了 2 秒：工具没理会信号，下载照样跑完，策略只能等它跑完，再把结果换掉。这和“打断”那一课是同一个道理：超时和用户打断走的是同一条路，都要靠工具接住 `exec.signal`。

## 和重试的分工

超时结果带着结构化的错误码 `TOOL_TIMEOUT`（[上游 timeout-policy](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/guard/timeout-policy/src/index.ts#L41-L48)），其他插件可以按这个码决定要不要重试。这一课里由模型自己决定：它看到超时，换了个做法。
