---
type: lesson
title: 依赖决定层次
focus: /main.ts
---

# 依赖决定层次

上一课的五个基础服务互不依赖，挂上就能用。这一课挂第一个有依赖的插件：工具运行时 `dsh-tools`。它在流程图上落在 L2。

## 现在的情况

`main.ts` 的根上挂了四个基础服务，故意少了 `system-prompt`，然后挂上 `tools`。终端里是：

```text
[plugin] ToolRuntime  pending，等待 systemPrompt
tools 最后的状态： pending
```

流程图上，`tools` 节点在 L2，状态是“等待依赖”，副标题写着“等待 systemPrompt”。原因在它的声明里（节选自上游 [`packages/core/tools/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/tools/src/index.ts#L808-L809)）：

```ts
export class ToolRuntime extends Service {
  static inject = ['systemPrompt']
```

`inject` 列出插件需要的服务。Cordis 只在这些服务都就绪时才运行插件；缺一个，插件就停在 `pending`，它自己提供的 `tools` 服务也不存在。没有报错，也没有抛异常，只是“还没开始”。

## 补上依赖

把 TODO 换成：

```ts
await harness.plugin(kernel['system-prompt'], DEFAULT_SYSTEM_PROMPT)
```

记得从 `./harness/index.ts` 导入 `DEFAULT_SYSTEM_PROMPT`，它是运行器默认的提示词配置，只保留一句人设，后面的请求更短。保存后终端变成：

```text
[plugin] ToolRuntime  pending，等待 systemPrompt
[plugin] SystemPrompt  active
tools 最后的状态： active
```

你没有重新挂载 `tools`。`systemPrompt` 服务一出现，Cordis 就自动启动了等待它的插件。所以组合里的挂载顺序无所谓，依赖关系决定启动顺序。

点“回放”看这个过程：`tools` 先出现在 L2，状态是“等待依赖”；`system-prompt` 出现在 L1 后，`tools` 依次变成“启动中”“已激活”。

## 两种连线

切到“依赖”视图，`tools` 有一条虚线指向 `system-prompt`，标着 `systemPrompt`：这是它 `inject` 的服务。

再切到“注册”视图，同样两个节点之间还有一条实线，标着 `tools()`。这是 `tools` 激活时做的事（节选自同一文件[第 857 行](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/tools/src/index.ts#L857)）：

```ts
ctx.systemPrompt.tools(context => this.wireSchemas(context.scope))
```

工具运行时把“当前有哪些工具”登记到提示词组装里，所以以后注册的每个工具都会自动出现在模型请求的 `tools` 里。依赖说明“我需要谁”，注册说明“我往谁那里放了什么”，后面的课会一直用这两种线。

流程图的分层就是按这两件事算的：提供服务又依赖别的服务，落在 L2；只往别的服务里注册东西、自己不提供服务，落在 L3。
