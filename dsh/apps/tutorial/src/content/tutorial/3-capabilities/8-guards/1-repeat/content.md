---
type: lesson
title: 原地打转时提醒一下
focus: /main.ts
terminal:
  open: true
  activePanel: 0
  panels: [['output', '输出'], ['terminal', '终端']]
---

# 原地打转时提醒一下

模型有时会陷进一个循环：用同样的参数一遍遍调用同一个工具，结果一样，它还是接着调。这一课的模型在等 CI：`check_ci` 每次都返回 `pending`，它就一直查。

`dsh-repeat-tool-reminder` 是上游的一个守卫插件。它不拦任何调用，只在模型连续重复同一个调用时，往对话里加一条提醒。

## 现在的情况

```text
[response] #10  调用 check_ci({"pr":42})
[response] #11  查了 10 次还是 pending，放弃了
check_ci 调用了 10 次
```

脚本里给这个模型设了上限，查满 10 次就放弃。真实的模型没有这个上限，可能一直查到步数或 token 用完。

## 动手

在 TODO 处挂上守卫，用默认配置：

```ts
await harness.plugin(RepeatToolReminder)
```

再运行：

```text
[response] #6  CI 一直是 pending，我先停下，等它跑完再看
check_ci 调用了 5 次

提醒（check_ci × 3）：
You are repeating the exact same tool call with identical arguments. Carefully analyze the previous result before calling again: ...

提醒（check_ci × 5）：
Repeated tool call detected:
- tool: check_ci
- consecutive_calls: 5
- arguments: {"pr":42}
The repeated calls are not making progress. Do not call this tool with these exact arguments again. ...
```

默认在连续第 3、5、8 次相同调用后提醒。第一次提醒语气温和，只说“你在重复，先看看上次的结果”；之后的提醒写明工具、次数和参数，明确说“不要再用这些参数调用”（[上游 repeat-tool-reminder](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/guard/repeat-tool-reminder/src/index.ts#L66-L86)）。这一课的模型故意设计得有点固执：不理第一次提醒，看到第二次才停。

## 怎么算“相同”

每次调用后，守卫把工具名和参数拼成一个键，参数先按属性名排序，所以 `{a:1,b:2}` 和 `{b:2,a:1}` 算同一个调用。键和上一次一样，计数加一；不一样，从 1 重新数（[上游 repeat-tool-reminder](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/guard/repeat-tool-reminder/src/index.ts#L196-L214)）。计数按 agent 分开记，子 agent 的重复不算到父 agent 头上。

用户说了新的话，计数清零。守卫在 `agent/pre-step` 上看这一步有没有新的用户消息，有就清掉计数（[上游 repeat-tool-reminder](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/guard/repeat-tool-reminder/src/index.ts#L236-L239)）。用户换了指令，重复同一个调用就不算打转。

## 提醒怎么进入对话

提醒挂在 `tools/post-execute` 上。它不改结果，也不拦调用，而是在决定上附带 `additionalContexts`（节选自[上游 repeat-tool-reminder](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/guard/repeat-tool-reminder/src/index.ts#L220-L231)）：

```ts
ctx.on('tools/post-execute', async (exec, _result, next): Promise<PostToolDecision> => {
  const reminder = observe(exec)
  const downstream = await next()
  if (!reminder) return downstream
  // ...
  return {
    ...downstream,
    additionalContexts: prependContext(reminder, downstream.additionalContexts),
  }
})
```

先调用 `next()`，让后面的监听器照常做决定（接受、替换、拦截都行），再把提醒附到返回的决定上。“工具守卫”那一章的守卫是说“不”，这个守卫只是“提一句”，两者可以挂在同一个钩子上，互不影响。

附带的消息先进 agent 的收件箱，下一步开始时写进会话日志，成为一条 `user/message`，来源是 `repeat-tool-reminder`。`main.ts` 就是按这个来源从日志里找出提醒的。模型看到的是一条用户消息，日志里能分清它来自守卫，而不是用户。

## 试一试

把配置改成 `{ thresholds: [2, 3] }`，模型在第 2 次收到温和提醒，第 3 次收到详细提醒，于是只查了 3 次。阈值要是整数、至少为 2、不能重复，否则插件加载时就报错。
