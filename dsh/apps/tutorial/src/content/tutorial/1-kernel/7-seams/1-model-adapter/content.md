---
type: lesson
title: 换一个模型提供方
focus: /echo-llm.ts
---

# 换一个模型提供方

dsh 把文件系统、进程、沙箱、模型、子代理这些能力都拆成 **seam**：一项可替换能力，包含三种角色。

- **服务定义**：声明 Cordis 服务的接口和请求、结果类型；
- **提供方**：实现这个接口；
- **消费方**：使用它，通常是面向模型的工具，或者 agent-loop 这样的内核插件。

提供方依赖定义，消费方依赖定义，**提供方和消费方互不依赖**。配置决定由哪个提供方来满足服务。

模型就是一个 seam。`dsh-llm` 是服务定义：它声明 `ctx.llm`、消息与流式词汇（`Message`、`ContentBlock`、`StreamChunk`），以及抽象类 `LlmAdapter`。提供方继承 `LlmAdapter`，实现 `stream()`，再用 `ctx.llm.registerAdapter(providers, adapter)` 注册到一个或多个路由名下。前面每一课用的确定性模型就是这样一个提供方，只是藏在了 `harness/` 里。

## 现在的情况

`echo-llm.ts` 是一个新的提供方：它把请求里最后一条消息念回去，注册在 `echo` 路由下。`main.ts` 用 `model: { provider: 'echo', model: 'echo-1' }` 让 agent 的请求走这条路由。

请求 #1 声明了 `add` 工具，但 echo 只会说话，所以回答“你说的是：2+3”。

流程图上，`llm-echo` 带着“课程”标签出现在 L2，和 `llm-scripted` 并排，两者在“注册”视图里各有一条 `registerAdapter()` 指向 `llm`。回放时，`请求 #1` 从 `agent-loop` 指向 `llm`，`响应 #1` 则从 `llm-echo` 发回：`llm` 按请求里的 provider 选中了它。

## 动手：让它调用工具

在 TODO 处，当最后一条是用户消息、形如 `a+b`、且请求声明了 `add` 时，发出一个工具调用：

```ts
if (last?.role === 'user' && sum && declared.includes('add')) {
  const id = ToolCallId(`echo-${++this.calls}`)
  const args = JSON.stringify({ a: Number(sum[1]), b: Number(sum[2]) })
  yield { type: 'block-start', index: 0, blockType: 'tool-call' }
  yield { type: 'tool-call-delta', index: 0, id, name: 'add', argumentsDelta: args }
  yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'add', arguments: args } }
  yield { type: 'finish', reason: { kind: 'tool-calls' } }
  return
}
```

再运行，就是第 4 章见过的两步轮次，回放里 `响应 #1` 之后又出现了四步 `tools/*`：请求 #1 调用 `add`，工具结果 `5` 回到请求 #2，echo 念出“你说的是：5”。

这一次，计算器工具、agent-loop、提示词组装、会话日志都没有改一行。它们只认 `StreamChunk`，不知道背后是哪个提供方。

## 流的形状

一次 `stream()` 调用产出的 chunk 有固定顺序：每个内容块是 `block-start`、若干增量、`block-end`，块按 `index` 编号；最后是 `finish`，它的 `reason` 告诉循环是正常结束（`stop`）还是在等工具结果（`tool-calls`）。`block-end` 带着完整的块，下游不必自己拼接增量。

上游给每个适配器定了一组约定，摘几条：

- **工具调用参数全程是原始 JSON 字符串。** 提供方 SDK 返回已解析的对象时，适配器要在 `block-end` 时重新序列化。
- **`usage` 在 `finish` 之前，`finish` 之后不再有任何 chunk。**
- **一次适配器调用就是一次提供方尝试。** 适配器禁用库内重试，重试统一由 agent 层的 `agent/request-error` 决定。
- **上下文溢出只有一个规范错误码** `CONTEXT_WINDOW_EXCEEDED`；**空 completion 是可重试错误** `EMPTY_RESPONSE`，不是静默的成功。

运行时并不逐条检查这些约定。试着把 `args` 换成对象，或者让 `stream()` 只产出一个 `finish`：这一课里都不会报错。约定靠文档和适配器自己的测试来守，压缩、重试、计量、UI 这些插件之所以能只针对 `StreamChunk` 和错误码编写，前提就是每个适配器都守约。

## 更大的 seam

rc.2 的 `packages/llm/` 下有 `llm-deepseek`、`llm-pi-ai` 等适配器，换模型提供方就是换一行配置。同样的思路用在执行环境上：文件、进程、沙箱三个服务共享一个“执行世界”，把它们的本地提供方换成 `fs-ssh`、`subprocess-ssh`、`sandbox-ssh`，Bash、终端和语言服务器就一起搬到了远程机器，模型使用的工具一个都不用改。

到这里，“内核架构”部分走完了内核的主要机制。下一部分“插件实战”换个角度：每一章从零写一个完整的插件。
