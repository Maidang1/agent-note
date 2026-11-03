---
type: lesson
title: 系统提示词是组装出来的
focus: /style.ts
---

# 系统提示词是组装出来的

在 dsh 里，没有哪个文件写着完整的系统提示词。`dsh-system-prompt` 提供 `ctx.systemPrompt`，它是一个注册表：各个插件往里贡献输入，每个模型步骤开始前，agent-loop 调用一次 `assemble()` 把它们组装起来。

## 四种输入

| 方法 | 输入 | 最终去向 |
|---|---|---|
| `section(section)` | 提示词片段：`name`、`order`、文本 | 拼进系统提示词 |
| `context(context)` | 动态运行时上下文 | 作为 user 角色的快照进入模型历史 |
| `variable(name, provider)` | 变量，供文本中的 `{{name}}` 引用 | 渲染时插值 |
| `tools(provider)` | 工具 schema 提供方 | 作为请求的工具定义 |

每个方法都返回 disposer，也就是 Cordis effect。插件卸载后，它贡献的片段、变量和工具就从下一次组装中消失。

流程图的“注册”视图把这些贡献画成指向 `system-prompt` 的实线，线上写着方法名：`tools` 的 `tools()`、`agent-loop` 的 `variable()`，以及这一课 `style` 的 `section()`（两个片段，所以标着 ×2）。

## 现在的情况

`style.ts` 注册了两个片段，其中一个引用了变量 `{{user}}`。但没有人注册这个变量，终端打印：

```text
[error] [s] 轮次以错误结束  unknown prompt variable "{{user}}" in section "lesson:address"; registered variables: provider, model
```

回放这一轮：`system-prompt/assemble` 从 `system-prompt` 指向每一个往它登记过内容的插件，`style` 也在其中；它和 `agent/pre-step` 之后，`step/start` 紧接着就是 `step/end`，没有 `请求 #1`。组装失败，请求根本没有发出。

这是**严格插值**：未知变量、已注册但无值的变量、格式错误的插值组都会抛错。上游 README 的原话是：格式错误的提示词比明确失败更糟。错误信息还告诉你，agent 组装时已经有 `provider` 和 `model` 两个变量可用。

## 动手

在 `apply` 里注册变量：

```ts
ctx.systemPrompt.variable('user', () => '小林')
```

“注册”视图里，`style → system-prompt` 多了一条 `variable()`。回放里出现了 `请求 #1`；在“步骤”列表里点开它，`system` 文本变成：

```text
你是一个助手

称呼用户为小林

回答时使用短句
```

## 顺序由数字决定

插件的加载顺序由 Cordis 依赖解析决定，不可预测，所以片段的顺序必须显式给出：先按 `order` 升序，相同时按名称排序。人设前缀 `deployment:persona-prefix` 的 `order` 是 0，所以 50 和 100 排在它后面。

仓库自带的片段位置集中定义在一张表里：harness 身份是 -1000，人设前缀是 0，计划策略 500，各工具的使用说明从 1000 开始，结构化输出要求是 9900。第三方插件可以用任意有限的数字，插到这个骨架的任意位置。试着把 `lesson:style` 的 `order` 改成 -10，看它跑到人设前面。

同一作用域里再次注册同名片段会抛错，而不是悄悄覆盖。想只对某个 agent 换一段提示词，要通过那个 agent 的 `agent.ctx` 注册。“插件实战”部分的“提示词贡献插件”一章会演示这种作用域覆盖。
