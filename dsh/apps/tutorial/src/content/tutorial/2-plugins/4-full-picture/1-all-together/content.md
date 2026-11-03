---
type: lesson
title: 完整的流程图
focus: /main.ts
---

# 完整的流程图

第一课从一个空的根开始，流程图上只有 `root` 和一个 `session`。这一课把一路写过的插件挂到同一个内核上，补上最后一个节点，然后完整走一遍一轮对话。

## 现在的情况

`main.ts` 用默认的内核和确定性模型，再挂上三个课程插件：

| 插件 | 来自 | 登记了什么 |
|---|---|---|
| `calculator` | 第一章“加一个工具” | `tools.register()`：`add` 工具 |
| `prompt-contributor` | 提示词贡献插件 | `systemPrompt.section()`：“回答时使用短句” |
| `git-branch` | 运行时上下文插件 | `systemPrompt.context()`：当前分支 |

流程图上，每一层都已经有了节点：

| 层 | 节点 | 哪一课画出来的 |
|---|---|---|
| L0 | `root` | 从一个空的根开始 |
| L1 | `session`、`session-projection`、`agent`、`system-prompt`、`llm` | 从一个空的根开始 |
| L2 | `tools`、`llm-scripted` | 依赖决定层次、agent loop 也是插件 |
| L3 | `calculator`、`prompt-contributor`、`git-branch`、`agent s` | 第一章第四课和“插件实战”部分 |
| L4 | `agent-loop` | agent loop 也是插件 |

L3 还少一个“插件实战”部分写过的插件：工具守卫。

## 动手

在 TODO 处挂上工具守卫，`deny` 留空，只审计、不拒绝：

```ts
await harness.plugin(toolGuard, { deny: [] })
```

记得从 `./tool-guard.ts` 导入 `toolGuard`。保存后 L3 多了 `tool-guard`，终端里多了四个检查点：

```text
[checkpoint] audit-enter  {"tool":"add"}
[checkpoint] policy-enter  {"tool":"add"}
[checkpoint] policy-return  {"tool":"add","decision":"allow"}
[checkpoint] audit-return  {"tool":"add","decision":"allow"}
```

## 三种线

先分别切到“依赖”和“注册”视图，把整张图的结构过一遍：

- **依赖**：每个课程插件都只有一条虚线，`calculator` 和 `tool-guard` 指向 `tools`，`prompt-contributor` 和 `git-branch` 指向 `system-prompt`。`agent-loop` 的六条虚线连到 L1 的五个服务和 L2 的 `tools`。
- **注册**：`system-prompt` 收到的实线最多：`tools()`、`variable()`、`section()`、`context()`。提示词就是从这些登记里组装出来的。`tools` 收到 `calculator` 的 `register()`；`tool-guard` 没有登记任何东西，它的线是 `on tools/pre-execute`，一个监听器。

插件之间从不互相调用。课程插件只认识 L1、L2 的服务，`agent-loop` 也只认识服务，不知道 L3 上有谁。

## 回放一轮

切到“数据流”视图，打开“步骤”列表，点“回放”。这一轮有两个步骤，按顺序会经过图上几乎每一个节点：

1. `用户输入「1+2」` 进入 `agent-loop`，`session` 把 `turn/start` 写进日志，发给 `session-projection` 和 `agent s`。
2. `system-prompt/assemble` 从 `system-prompt` 指向 `tools`、`agent-loop`、`prompt-contributor`、`git-branch`：组装提示词时，读的就是它们登记的内容。
3. 日志里先后写入 `system/message` 和两条 `user/message`：一条是用户的“1+2”，一条是 `git-branch` 的运行时上下文快照。然后才是 `请求 #1`，从 `agent-loop` 指向 `llm`。
4. `响应 #1 · 调用 add(…)` 从 `llm-scripted` 发回 `llm`。
5. 工具流水线：`tools/pre-execute · add` 指向 `tool-guard`，接着是它的四个检查点；`tools/execute · add` 指向 `calculator`，工具本体在这里运行；然后是 `tools/post-execute` 和 `tools/result`。
6. 第二个步骤又从 `system-prompt/assemble` 开始，`请求 #2` 带着工具结果发出，`响应 #2 · 结果是 3`，`turn/end`。

`main.ts` 里的模型脚本用 `userIncludes` 而不是 `lastUserText` 匹配用户输入，原因就在第 3 步：最后一条 user 消息是上下文快照，不是用户说的话。

## 一切皆插件

回头看这张图：会话日志、提示词组装、工具运行时、模型适配器、驱动对话的循环，和你写的四个插件画在同一张图上，用同样的三种线连接。没有哪个节点是特殊的内核，扩展 dsh 的方式就是往这张图上加节点和线。

下一部分“上游能力插件”换个方向：不再自己写插件，而是把上游现成的审批、持久化、重试、压缩、子 agent、MCP、spill、守卫、回放插件挂到这张图上，看每一个解决什么问题。

想继续深入，可以读 `docs/blog/` 下的架构系列，或者直接翻上游仓库的包级 README：本教程挂载的内核插件都原样来自 npm 上发布的 `@deepseek-ai/dsh-*`，你在课程里读到的行为就是它们的真实行为。
