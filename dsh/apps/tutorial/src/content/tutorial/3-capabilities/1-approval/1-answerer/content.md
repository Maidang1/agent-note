---
type: lesson
title: 把 ask 交给应答者
focus: /answerer.ts
---

# 把 ask 交给应答者

“工具流水线”一课里说过，`tools/pre-execute` 可以返回 `ask`：这次调用要先问人。这一章看 `ask` 之后发生什么。它由上游的审批服务 [`dsh-user-approval`](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/interaction/user-approval/README.zh.md) 接手。

这一课的场景是给 PR 发布评审。`review.ts` 登记了 `post_review` 工具，并在 `tools/pre-execute` 上要求审批：

```ts
if (exec.name === 'post_review') return { kind: 'ask', reason: '发布评审需要人工确认' }
```

`main.ts` 挂上了审批服务（`Approval`，原样从 npm 引入）和本课的 `answerer.ts`。

## 现在的情况

展开终端，看第二次请求：

```text
  审批请求：post_review，理由：发布评审需要人工确认
[request] #2  tools: post_review
    最后一条消息（tool）
    │ Error: tool "post_review" requires approval, but no approval channel is available
```

应答者被问到了，但它只是调用 `next()`，把问题传了下去。最内层的默认答案是 `unavailable`：没有人回答。工具运行时把它变成拒绝，工具本体没有运行。

最后两行是审批服务写进会话日志的审计记录：

```text
审计 approval/asked {"toolName":"post_review","callId":"call-1","reason":"发布评审需要人工确认"}
审计 approval/decided {"outcome":"unavailable"}
```

流程图的“数据流”视图里，`tools/pre-execute · post_review` 指向 `review`，紧接着是 `approval/request · post_review`，指向 `answerer`。`user-approval` 在 L2，“注册”视图里有一条 `context()` 指向 `system-prompt`：它往每次请求里放一段运行时上下文，就是请求 #1 最后一条消息里的 “Approval policy: ask…”。

## 动手

在 `answerer.ts` 的 TODO 处，不再调用 `next()`，直接回答“允许一次”：

```ts
return 'allowed-once'
```

再运行：

```text
[request] #2  tools: post_review
    最后一条消息（tool）
    │ 已发布到 PR #42：可以合并
...
审计 approval/decided {"outcome":"allowed-once"}
```

回放这一轮，`approval/request · post_review` 之后多了 `tools/execute · post_review`：工具本体这次运行了。

## 四种结果，只有一种放行

应答者是 `approval/request` 上的 waterfall 监听器，返回值只有四种：

| 结果 | 模型看到的工具结果 |
|---|---|
| `allowed-once` | 工具正常执行的结果 |
| `rejected` | `the user rejected tool "post_review"` |
| `cancelled` | `approval for tool "post_review" was cancelled` |
| `unavailable` | `tool "post_review" requires approval, but no approval channel is available` |

（[节选自上游 dsh-tools](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/tools/src/index.ts#L1735-L1780)。）只有 `allowed-once` 放行，其余三种都是拒绝，只是理由不同，模型能分清“用户说不”和“没人可问”。

这套设计处处**失败即关闭**（fail closed）：

- 没有应答者，或者每个应答者都调用 `next()`，结果是 `unavailable`。
- 应答者抛错，或者返回了这四种之外的值，也按 `unavailable` 处理，[审批服务](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/interaction/user-approval/src/index.ts#L267-L307)在内部兜住了。
- 根本没挂审批服务时，工具运行时也直接拒绝，理由是 `ask` 里写的 `reason`。

“允许一次”就是字面意思：批准只对这一次调用有效，下次再调用 `post_review` 还要再问。

## 应答者是谁

审批服务自己从不弹窗问人，它只负责记审计日志、执行策略、把问题交给应答者。终端界面、Web 界面、IDE 插件各自在 `approval/request` 上挂一个应答者，替用户回答。这一课的 `answerer.ts` 就是一个最简单的应答者。

还有一个前提：审批请求必须在一轮对话之内发出。上游 README 的解释是，轮次是持久日志提交和重放的边界，轮次之外的孤立事件在重新加载时会被当作崩溃留下的残尾丢掉。所以 `approval/asked` 和 `approval/decided` 总是成对出现在同一轮里。
