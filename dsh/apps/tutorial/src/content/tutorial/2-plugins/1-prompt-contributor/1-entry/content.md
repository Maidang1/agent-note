---
type: lesson
title: 插件入口与依赖
focus: /contributor.ts
---

# 插件入口与依赖

“插件实战”部分每一章从零写一个完整的插件。这一章的插件很小：往系统提示词里加一句“回答时使用短句”。一路上会碰到插件作者绕不开的四件事：依赖、配置、清理、作用域。

## 最小插件

Cordis 插件可以只是一个模块：导出 `name` 和 `apply`。`contributor.ts` 就是这样，`apply` 里调用 `ctx.systemPrompt.section()` 贡献一段提示词。

`main.ts` 在一个空的 Cordis 根上先挂这个插件，再挂上游的 system-prompt 插件。两次打印都是 `failed`：挂载时 `apply` 立刻运行，`ctx.systemPrompt` 还不存在，`apply` 抛错，插件进入 `failed`。之后服务来了，它也不会重试。

和“内核架构”部分的 Cordis 课程一样，这个根是 `main.ts` 自己建的，用 `draw(root)` 交给流程图。图上 L3 的 `prompt-contributor` 停在“失败”，L1 的 `system-prompt` 已激活，两者之间没有线。

## 动手：声明依赖

在 TODO 处加一行：

```ts
export const inject = ['systemPrompt']
```

再看输出：

```text
还没有 system-prompt： pending
apply 运行了
挂上 system-prompt 后： active
```

流程图上，`prompt-contributor` 变成“已激活”，“依赖”视图多了一条指向 `system-prompt` 的虚线，“注册”视图多了一条 `section()`。回放能看到它先以“等待依赖”出现，`system-prompt` 挂上后才激活。

`inject` 告诉 Cordis：没有这个服务就不要运行 `apply`。插件先停在 `pending`，服务就绪后才激活。服务消失时插件回到 `pending`，服务回来时 `apply` 再运行一次，“内核架构”部分的 Cordis 课程演示过这个过程。

所以插件里从不需要写“服务还没准备好”的判断，也不用关心插件的挂载顺序。dsh 的配置文件里，几十个插件的书写顺序和它们的启动顺序没有关系，依赖图决定一切。
