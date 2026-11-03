---
type: lesson
title: 录一次，回放很多次
focus: /main.ts
terminal:
  open: true
  activePanel: 0
  panels: [['output', '输出'], ['terminal', '终端']]
---

# 录一次，回放很多次

一直以来，课程都用脚本模型代替真模型。写测试时也有同样的需要：真模型每次回答不一样，要花钱，还要 API 密钥。上游的做法是：用真模型跑一次，把会话日志存下来当 fixture（测试数据）；之后的测试从 fixture 里回放模型的输出，agent 的其余部分照常运行。负责回放的是 `dsh-llm-replay`。

这一课有三个文件：

- `record.ts`：录制。用脚本模型扮演真模型，挂上会话持久化，跑一次，把日志复制到 `fixtures/add.jsonl`。
- `fixtures/add.jsonl`：已经录好的 fixture，可以在编辑器里打开看看。
- `main.ts`：测试。没有可用的模型，从 fixture 回放，再把这次的工具结果和录制时的对比。

## 现在的情况

```text
[request] #1  tools: add
[error] [s] 轮次以错误结束  模型脚本 "offline" 没有规则匹配这次请求
录制时的工具结果： ["3"]
这次的工具结果： []
不一致
```

`main.ts` 里的脚本一条规则也没有，相当于没有模型，第一次请求就失败了。

## 动手

在 TODO 处挂上回放插件：

```ts
await harness.plugin(LlmReplay, { file: fixture })
```

再运行：

```text
[response] #1  调用 add({"a":1,"b":2})
[request] #2  tools: add
    最后一条消息（tool）
    │ 3
[response] #2  1+2 等于 3
[turn] [s] 轮次结束  completed
录制时的工具结果： ["3"]
这次的工具结果： ["3"]
一致
```

## 回放从哪里来

打开 `fixtures/add.jsonl`。第一行是会话头，之后每行一条事件，就是“会话日志”一章里的那些事件。其中两条 `assistant/message` 是模型的两次回答：一次调用 `add`，一次说出答案。

回放插件读这个文件，把每条 `assistant/message` 展开成一次模型调用的流式输出，按顺序排成脚本（[上游 deriveReplayScript](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/test-support/llm-replay/src/index.ts#L462-L503)）。日志里还留着持久化写下的 `seq` 和 `time`，这也没关系：fixture 的每行要么都带这些字段，要么都不带（[上游 parseSessionLog](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/test-support/llm-replay/src/index.ts#L200-L211)）。

没有配置 `providers` 时，回放插件挂在 `llm/stream` 这个 waterfall 上（节选自[上游 llm-replay](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/test-support/llm-replay/src/index.ts#L1102-L1104)）：

```ts
const dispose = providers.length > 0
  ? ctx.llm.registerAdapter(providers.map(provider => provider.id), new ReplayAdapter(providers, replay))
  : ctx.on('llm/stream', (options: GenerateOptions, _next) => replay(options))
```

监听器不调用 `_next`，直接返回录制的流，请求根本到不了适配器。所以脚本模型虽然还挂着，却一次也没被问到。打开流程图回放这一轮：请求 #1 同时指向 `llm` 和 `llm-replay`，响应来自 `llm-replay`。

## 回放不看输入

把 `main.ts` 里的 `'1+2 等于几？'` 改成 `'2+2 等于几？'` 再运行，模型照样调用 `add({"a":1,"b":2})`，照样说“1+2 等于 3”。

回放只是按顺序送回录好的输出，不检查请求和录制时是否一样。模型这一侧被固定了，测的是你自己的代码。反过来，提示词或用户输入一改，fixture 就过时了，要在终端里运行 `node record.ts` 重新录制。

## 试一试：抓住一次回归

把 `calculator.ts` 里的 `args.a + args.b` 改成 `args.a - args.b`，再运行：

```text
    │ -1
[response] #2  1+2 等于 3
录制时的工具结果： ["3"]
这次的工具结果： ["-1"]
不一致
```

工具返回了 -1，回放的模型却还是说“等于 3”，因为它只会复述录制时的话。所以不能只看最后的回答，要对比你的代码产生的东西：这一课对比的是工具结果。上游的快照测试（`dsh-session-snapshot`）比较得更全：规范化之后的输出、整份会话日志，还有工作区里的文件变化。

## 少调用也要报错

如果改动让 agent 少调用了一次模型，回放不会自己报错，剩下的录制就那么剩着。直接用 `installLlmReplay(ctx, config)` 安装回放时，会拿到一个 `assertConsumed()`，测试结束时调用它：还有录制没被用完，就抛错（[上游 llm-replay](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/test-support/llm-replay/src/index.ts#L1105-L1121)）。插件形式 `harness.plugin(LlmReplay, ...)` 不返回这个句柄。
