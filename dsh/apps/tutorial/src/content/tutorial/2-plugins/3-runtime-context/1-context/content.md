---
type: lesson
title: 会变的事实放进上下文
focus: /branch.ts
---

# 会变的事实放进上下文

这一章写一个插件，告诉模型当前的 git 分支。分支会变：`main.ts` 在第二轮和第三轮之间把它从 `main` 改成 `feat/login`。

`branch.ts` 现在用 `section()` 贡献一个动态片段，`text` 是函数，每次组装时求值。看起来没问题，模型每次都能看到最新分支。但看请求 #3 和最后两行：

```text
[request] #3
    system
    │ 你是一个助手
    │
    │ 当前分支：feat/login
...
system/message 事件： 2
```

分支一变，**系统提示词**就变了。它是请求的第一条消息，后面所有历史都排在它之后。

## 为什么这是个问题

模型提供方的 KV Cache（前缀缓存）按字节比较请求前缀：只要前面的内容和上一次请求一模一样，这一段就不用重新计算。上游 system-prompt 的 README 这样描述系统提示词变化的代价：

> 没有 `systemPromptUpdate` 时，非空提示词文本通过有日志记录的逐节点替换归并到首个系统节点，因此头节点重写会从首个变化的 token 起失去前缀复用。

回放第三轮也能看到：`请求 #3` 之前又写了一条 `session/event · system/message`，第二轮没有。

也就是说，一个会变的事实写进系统提示词，每变一次，整段对话历史都要重新计算一次。会话越长，代价越大。日志里多出的那条 `system/message` 就是这次替换的记录。

## 动手

把 `section` 换成 `context`，参数不变：

```ts
ctx.systemPrompt.context({ name: 'lesson:branch', order: 100, text: () => `当前分支：${state.current}` })
```

再看请求：

```text
[request] #3
    system
    │ 你是一个助手
    messages
    │ user: 第一条
    │ user: Current runtime context. This snapshot supersedes earlier runtime-context snapshots.
    │
    │ 当前分支：main
    │ assistant: 好
    │ user: 第二条
    │ assistant: 好
    │ user: 第三条
    │ user: Current runtime context. ...
    │
    │ 当前分支：feat/login
```

- 系统提示词三次请求都一样，`system/message` 只有 1 条。“注册”视图里，`git-branch` 的线从 `section()` 变成了 `context()`。
- 上下文变成一条 **user 角色的快照**，追加在历史末尾。请求 #2 没有新快照，因为分支没变；请求 #3 分支变了，追加一条新快照，旧快照留在原处，新快照声明自己取代之前的快照。
- 前面的历史一个字节都没变，前缀缓存可以一直复用到新快照之前。

上游 README 的原话是：**将变化的事实放在上下文 provider 中**。

## 快照也是日志

快照是普通的 `user/message`，`source.kind` 是 `runtime-context`，所以 `user/message` 从 3 条变成 5 条。这又回到“内核架构”部分的“模型可见即已记录”：模型看到的每个分支值，日志里都有记录，回放时能准确还原“模型当时以为自己在哪个分支上”。

agent-loop 在每一步开始前渲染全部上下文，和上一条保留的快照比较，相同就什么都不发。上下文变成空时，它会发一条“none”快照，明确告诉模型旧快照不再适用，而不是悄悄消失。

dsh 自己的工作目录服务就是这样，以上下文提供当前目录。经验法则：**稳定的指令放 section，会变的事实放 context。**

最后一课把这一部分写的插件挂到一起，画出完整的流程图。
