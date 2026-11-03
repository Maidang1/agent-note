---
type: lesson
title: 读懂课程代码
focus: /main.ts
---

# 读懂课程代码

课程代码是 TypeScript：在 JavaScript 上加了类型标注的语言。这一课逐行读一遍 `main.ts`，课程里用到的语法基本都在这里了，然后给假模型加一条规则。

## 现在的情况

`main.ts` 发的是“你是谁”。流程图上的 `响应 #1` 以“出错”开头，打开“步骤”列表点到它，能看到完整原因。终端里是：

```text
[error] [s] 轮次以错误结束  模型脚本 "demo" 没有规则匹配这次请求
```

假模型只认识写好的规则，没有一条规则管“你是谁”，这一轮就以错误结束。

## 逐行读

**导入**

```ts
import { createHarness } from './harness/index.ts'
import * as calculator from './harness/calculator.ts'
```

`import` 从别的文件拿东西来用。第一种写法按名字取出 `createHarness`；第二种把整个文件当成一个对象，叫 `calculator`。`./` 开头的是同目录下的文件。以后也会看到 `from '@deepseek-ai/…'`，那是从 npm 包里导入。

**等待：`await`**

```ts
const harness = await createHarness({ ... })
```

`const` 声明一个变量。`createHarness()` 要花点时间（挂载插件），返回的是一个“稍后才有结果”的 Promise；`await` 表示等它完成，再把结果放进 `harness`。课程代码里凡是会“等”的调用，前面都有 `await`，漏写的话，程序不会等这件事做完就往下走了。

**对象和数组**

```ts
{ id: 'call-add', match: { lastUserText: '1+2' }, respond: { kind: 'tool-call', tool: 'add', arguments: { a: 1, b: 2 } } }
```

`{ 名字: 值, ... }` 是对象，`[ ..., ... ]` 是数组，可以层层嵌套。字符串用单引号。`//` 后面是注释，程序不会运行它。

**调用**

```ts
await harness.plugin(calculator)
await harness.send(question)
await harness.dispose()
```

挂上计算器插件，发一条消息，最后关掉 agent。

以后的课还会看到两种写法：`ctx: Context` 这样的**类型标注**，告诉编辑器这个变量是什么类型，运行时会被去掉；`export function apply(ctx) { ... }` 声明一个函数并把它**导出**给别的文件用，插件就是这样写的。

## 哪些是 dsh，哪些是教程写的

| 代码 | 来自 |
|---|---|
| `@deepseek-ai/dsh-*`、`@deepseek-ai/cordis` | 上游：npm 上发布的 dsh 和它所用的插件框架 Cordis，原样运行 |
| 流程图上 L1、L2、L4 的内核插件（`session`、`tools`、`agent-loop` 等） | 上游 |
| `createHarness()`、`harness.plugin()`、`harness.send()`、`checkpoint()` | 教程：`harness/` 目录里的课程运行器，帮你少写搭建代码，打印输出、画流程图 |
| 假模型 `llm-scripted`、计算器 `calculator` | 教程：用上游接口写的小插件 |
| 每课目录里的其他文件（`tool-guard.ts` 等） | 教程：你在课程里写的插件 |

运行器只负责搭建和观察，不改变 dsh 的行为。你在流程图上看到的顺序，就是真实的 dsh 的顺序。

## 假模型的规则

`rules` 里的每条规则有三部分：

- `id`：名字，随便起；
- `match`：什么样的请求用这条规则。`lastUserText` 是“用户最后一句话正好是”，`afterToolResult` 是“刚拿到这个工具结果”；
- `respond`：怎么回答。`kind: 'text'` 直接回答一段文字，`kind: 'tool-call'` 请求调用工具。

每次请求，假模型从上往下找第一条匹配的规则。

## 动手

在 TODO 处加一条规则：

```ts
{ id: 'who', match: { lastUserText: '你是谁' }, respond: { kind: 'text', chunks: ['我是一个按脚本回答的模型'] } },
```

注意末尾的逗号：数组里的元素用逗号隔开。保存后，`响应 #1` 变成“我是一个按脚本回答的模型”，这一轮正常结束。

再试试把 `question` 改成“1+2”：`call-add` 和 `answer` 两条规则接力，和上一课一样。

## 接下来

到这里，你知道了 agent 是什么，也能读懂课程代码了。下一部分“内核架构”从一个**空的**根开始，一个插件一个插件地把右边这张图从零画出来，看 dsh 的每一部分是怎么接起来的。
