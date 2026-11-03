---
type: lesson
title: 加一个工具插件
focus: /calculator.ts
---

# 加一个工具插件

上一课的内核只能聊天，流程图上 L3 还空着。这一课给它加一种能力：一个能做加法的 `add` 工具。你不会碰 agent loop 的任何代码，只写一个插件，它落在 L3。

从这一课开始，`main.ts` 用 `createHarness()` 的默认值一次挂上前三课画出的七个内核插件和确定性模型，流程图一打开就是完整的 L1、L2、L4。

## 现在的情况

`main.ts` 挂载了 `calculator.ts`，然后发出“1+2”。模型脚本有三条规则：

- 请求里声明了 `add` 工具时，调用它；
- 工具结果是 `3` 时，回答“结果是 3”；
- 否则只能回答“我没有可以用的计算工具”。

`calculator.ts` 的 `apply` 还是空的。流程图上，`calculator` 带着“课程”标签出现在 L3，“依赖”视图里有一条虚线指向 `tools`，但“注册”视图里它没有任何线：它什么也没往 `tools` 里放。所以请求里没有工具（在“步骤”里点开 `请求 #1` 能看到 `tools：(无)`），模型走了第三条规则。

## 注册一个工具

在 `apply` 里调用 `ctx.tools.register()`，传入 `defineTool()` 定义的工具：

```ts
ctx.tools.register(defineTool({
  name: 'add',
  description: 'Add two numbers',
  parameters: {
    a: { type: 'number', required: true },
    b: { type: 'number', required: true },
  },
  output: {
    schema: { type: 'number' },
    render: (_args, value) => [{ type: 'text', text: String(value) }],
  },
  execute: (args: { a: number; b: number }) => Promise.resolve(args.a + args.b),
}))
```

`execute` 返回 `output.schema` 声明的值；`output.render` 把值变成写进日志、给模型看的内容。两者是分开的，第 6 章会讲为什么。

保存后再看步骤列表（或打开终端），这一轮变成了两次请求：

1. 请求 #1 声明了 `add`，模型返回一个工具调用；
2. 循环执行工具，把结果 `3` 追加到日志，再发请求 #2，模型给出答案。

流程图上，“注册”视图多了一条 `calculator → tools：register()`。“数据流”视图里，两次请求之间多了四步：`tools/pre-execute · add`、`tools/execute · add`、`tools/post-execute · add`、`tools/result · add`，都由 `tools` 发出，其中 `tools/execute · add` 指向 `calculator`：工具本体是它登记的。这就是工具流水线，第 6 章会讲每一步谁可以插手。

在 dsh 的术语里，这是一个**轮次（turn）**、两个**步骤（step）**。步骤是一次模型请求加上这次响应里请求的所有工具调用，第 4 章会展开。

## 这十几行代码依赖了什么

- `inject = ['tools']`：插件等到 `ctx.tools` 服务就绪才运行 `apply`。`dsh-tools` 自己又依赖 `systemPrompt` 服务，少了 `dsh-system-prompt`，这两个插件都会停在等待状态。
- `ctx.tools.register()` 是 Cordis 的 effect：插件卸载时，工具自动注销，不需要写清理代码。
- 工具注册表会把 schema 自动贡献给提示词组装，所以下一次请求就带上了 `add`。

上游的“新行为该放在哪里”映射表里，“添加面向模型的能力”对应的正是“在 `ctx.tools` 上注册工具”。拿到需求先找扩展点，而不是在循环里插一行 `if`，这就是“用插件扩展，不改循环”这条不变式。
