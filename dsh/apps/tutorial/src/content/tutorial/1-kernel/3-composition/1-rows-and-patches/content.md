---
type: lesson
title: 配置行、patch 与依赖
focus: /main.ts
---

# 配置行、patch 与依赖

`dsh web` 和 `dsh --profile headless "task"` 启动的是同一个程序，得到的却是两种完全不同的应用。dsh 的启动器只做一件事：**按 profile 组合出一份 Cordis 配置列表，交给 Loader 挂载**。形态之间的差别全部落在配置数据里。

## 三个概念

- **组合包（bundle）**：一组 Cordis 配置行，本身是一个 npm 包，比如 `dsh-base`、`dsh-headless`。
- **profile**：具名组装，列出自己叠放的组合包，保存用户自己的 `cordis.patch.yml`。
- **patch**：一组按 `id` 定位的配置行操作。

启动时各层依次应用在一个空列表上：组合包的 patch，然后是 profile 的 patch、Harness home 的 patch、命令行 `--patch`。后面的层优先级更高，所以**任何一个官方配置行都能被用户自己的 patch 替换**。

## 示意加载器

`loader.ts` 是本课写的示意加载器，不是上游的 Loader。它只模仿 patch 的三种操作：

- 写出已有 `id` 和新的 `config`：**替换该行的整个 config**，不是合并；
- `insert`：插入新行；
- `disabled: true`：保留该行，但不挂载。

挂上的插件是真实的上游内核。`bundle` 的顺序是故意打乱的：`agent-loop` 写在第一行。

## 现在的情况

用户 patch 禁用了 `system-prompt`。终端里的插件树是：

```text
  agent-loop           pending  等待 tools, systemPrompt
  tools                pending  等待 systemPrompt
  ...
  system-prompt        disabled
```

流程图上 L1 少了 `system-prompt`，`tools` 和 `agent-loop` 都是“等待依赖”。“依赖”视图里，指向 `systemPrompt` 和 `tools` 的虚线都没有画出来：被依赖的服务不存在，线就没有终点。

`tools` 注入了 `systemPrompt`，`agent-loop` 又注入了 `tools`。少了一行，依赖链上的插件都停在 PENDING，不报错也不输出。

在完整的 dsh 应用里，启动器会在 Loader 结算后报告未激活的条目；required 条目无法激活时，`boot()` 以 `StartupError` 失败，并打印失败的插件和在等待的服务。`report()` 模仿的就是这份诊断。

## 动手

把 patch 改成替换 `system-prompt` 这一行的 config：

```ts
const userPatch: PatchOp[] = [
  { id: 'system-prompt', config: { personaPrefix: '你是一个代码审查助手' } },
]
```

现在所有行都是 `active`，流程图和第一章画出的内核一样（这里没有挂模型适配器），尽管 `agent-loop` 写在第一行：配置只回答“装什么”，“什么时候装好”由依赖回答。

再看组装出的系统提示词，开头多了一句 `You are an AI agent powered by DeepSeek Harness.`。原来的 config 里有 `includeHarnessIdentity: false`，新 config 没写这个字段，它就回到了默认值。整行替换的语义简单、可预测；代价是覆盖某一行时，必须重述所有想保留的字段。

## id 为什么重要

base 启用了只监视配置的热重载插件 `dsh-hmr`。配置变化后，Loader 按 `id` 比较新旧两份配置，只挂载、卸载或重新配置发生变化的行。这依赖上一章的两个性质：卸载会撤销所有 effect，加载遵循依赖关系。所以 dsh 的每个配置行都带显式 `id`，否则任何一处编辑都会让它被当成“先删除再添加”。

想看一个真实应用的配置树，可以运行 `dsh --profile web --dump-config`。
