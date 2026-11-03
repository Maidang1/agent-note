---
type: lesson
title: 作用域内的覆盖
focus: /main.ts
---

# 作用域内的覆盖

插件贡献的 `lesson:style` 对所有会话生效。如果某一个会话要用英文回答呢？

在同一个作用域里再注册一次同名片段会抛错，上一课已经见过。错误信息本身给了答案：

```text
prompt section "lesson:style" is already registered
(for a per-agent override, register through that agent's `agent.ctx` instead)
```

## 动手

`harness.agent(sessionId, setup)` 创建 agent 时，上游 agent 工厂先为它铸造一个 `agent.ctx`，在 agent 发布之前运行 `setup(agentCtx, agent)`。在 TODO 处通过 `agentCtx` 注册同名片段：

```ts
agentCtx.systemPrompt.section({ name: 'lesson:style', order: 100, text: '回答时使用英文' })
```

两个会话的请求不再一样：

```text
[user] [s] 你好         │ 回答时使用短句
[user] [en] 你好        │ 回答时使用英文
```

流程图 L3 上的 `agent s` 和 `agent en` 是两个 agent 的作用域。课程结束时 agent 都已销毁，所以它们显示“已卸载”；回放到中间能看到它们出现。回放两轮的 `system-prompt/assemble`：第一轮（会话 `s`）指向 `prompt-contributor` 等全局贡献者，第二轮（会话 `en`）还多指向了 `agent en`。在“步骤”列表里分别点开两轮的 `请求 #n`，system 文本最后一句不同。

## 作用域是怎么叠起来的

组装提示词时，注册表按“全局层，再到 agent 的作用域层”合并片段。内层的同名片段遮住外层的，其他片段照常保留，所以会话 `en` 依然有人设前缀。会话 `s` 的组装不经过 `en` 的作用域，看不到这次覆盖。

它和上一课是同一个机制：注册所用的 context 同时决定**可见范围**和**归属**。通过 `agentCtx` 注册的片段只对这个 agent 可见，也归它所有，agent 销毁时自动撤销。

`setup` 在 agent 发布之前运行，于是第一次组装提示词时，覆盖就已经在了，观察者不会看到一个“配置了一半”的 agent。dsh 的工具（`agent.ctx.tools.register`）、guard、`restrict()` 和事件监听器都能这样按 agent 注册。agent preset 把这件事做成了配置：在 YAML 里为某类 agent 列出一组插件，挂在它自己的作用域下。

下一章换一个扩展点，用同样的方式写一个工具守卫。
