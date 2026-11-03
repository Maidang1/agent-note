---
type: lesson
title: never 策略：无人值守时一律拒绝
focus: /main.ts
---

# never 策略：无人值守时一律拒绝

上一课的应答者对每个请求都回答“允许一次”。开发者坐在终端前时，这代表他点了“允许”；放到 CI 里，同一个应答者就成了自动盖章。

`main.ts` 开了两个会话：`dev` 是开发者，`ci` 是无人值守的流水线。现在两边的输出一样：

```text
[dev] 审计： [
  'approval/asked {"toolName":"post_review"}',
  'approval/decided {"outcome":"allowed-once"}'
]
[ci] 审计： [
  'approval/asked {"toolName":"post_review"}',
  'approval/decided {"outcome":"allowed-once"}'
]
```

CI 里没有人看过这条评审，它却被发布了。

## 动手

在 TODO 处把 `ci` 会话的策略切换成 `never`：

```ts
harness.root.approval.setPolicy(ci, 'never')
```

再看 `ci` 这一轮：

```text
[request] #3  tools: post_review
    messages
    │ user: The approval policy changed from "ask" to "never" (changed by the user).
    │ user: 给 PR #42 发布评审
    │ user: Current runtime context. This snapshot supersedes earlier runtime-context snapshots.
    │
    │ Approval prompts are disabled in this session: actions that require approval are rejected automatically …
[response] #3  调用 post_review({"pr":42,"body":"可以合并"})
[request] #4  tools: post_review
    messages
    …
    │ tool: Error: the user rejected tool "post_review"
```

`审批请求：…` 那一行只在 `dev` 里出现了一次：`ci` 的请求根本没到应答者那里。回放 `ci` 这一轮，`tools/pre-execute · post_review` 之后没有 `approval/request`，直接是 `tools/post-execute`。

审计记录多了一条策略事件：

```text
[ci] 审计： [
  'approval/policy {"policy":"never"}',
  'approval/asked {"toolName":"post_review"}',
  'approval/decided {"outcome":"rejected"}'
]
```

## 策略在应答者之前

`never` 不是一个“拒绝一切”的应答者，而是审批服务在派发 `approval/request` 之前做的判断：

```ts
if (this.effectivePolicy(session) === 'never') return 'rejected'
```

（[节选自上游 dsh-user-approval](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/interaction/user-approval/src/index.ts#L275)。）上游的注释说明了为什么不做成监听器：后注册的监听器可以用 `prepend` 排到它前面，那样“`never` 一定拒绝”就靠不住了。放在服务自己的请求路径上，任何插件都绕不过去。

注意 `never` 的结果是 `rejected`，不是 `unavailable`：结果是事先就能确定的，不需要问任何人。

## 策略是会话日志里的事实

`setPolicy()` 做了两件事：

1. 往会话日志追加一条 `approval/policy`。会话的有效策略就是日志里最后一条 `approval/policy`，没有时用插件配置里的默认值。所以策略能随会话持久化、重放，切换后也不会影响别的会话：`dev` 仍然是 `ask`。
2. 给 agent 排一条用户消息“The approval policy changed …”，下一步模型就能看到。

模型还从运行时上下文里读到当前策略的完整含义。这段文本放在历史消息之后，而不是系统提示词里，切换策略不会改动系统提示词，前缀缓存不受影响。

要让整个部署默认无人值守，写在配置里：

```yaml
- name: '@deepseek-ai/dsh-user-approval'
  config:
    policy: never
```

分工到这里就清楚了：工具只管在 `pre-execute` 里说 `ask`；谁来回答、能不能回答、怎么留痕，都交给审批服务。
