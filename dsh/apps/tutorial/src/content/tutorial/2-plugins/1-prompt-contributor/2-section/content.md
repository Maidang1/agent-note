---
type: lesson
title: 贡献片段与配置
focus: /contributor.ts
---

# 贡献片段与配置

插件现在声明了依赖，还导出了 `Config`，但 `apply` 是空的，请求的 `system` 文本里只有人设。从这一课起回到完整的内核：流程图上 L1、L2、L4 都在，`prompt-contributor` 在 L3，“注册”视图里它没有任何线。

## 动手：注册片段

在 TODO 处调用 `section()`：

```ts
ctx.systemPrompt.section({ name: config.name, order: config.order, text: config.text })
```

请求的 `system` 文本多出一段：

```text
你是一个助手

回答时使用短句
```

“注册”视图里多了一条 `prompt-contributor → system-prompt：section()`。

片段先按 `order` 升序，相同时按 `name` 排序，再用空行连接。人设前缀的 `order` 是 0，100 排在它后面。

## Config：配置是插件的公开接口

`Config` 用 schemastery 描述配置，Cordis 在 `apply` 之前按它校验，并补上默认值。`main.ts` 先用 `{ order: '靠前' }` 挂了一次，`ctx.plugin()` 当场抛出 `ValidationError`，`apply` 根本没有运行：

```text
配置被拒绝： invalid config:
  - $.order expected number but got 靠前 (at order)
```

终端里这两行上面还有一条 `[error] prompt-contributor  invalid config: …`，内容相同。那是 Cordis 自己记下的：插件挂载失败时，它把错误写进 `ctx.logger`。课程把各插件通过 logger 报告的警告和错误都打印成 `[warn]`、`[error]` 行，很多插件出问题时不抛错，只在这里留一句话。

流程图上 L3 因此有两个 `prompt-contributor`：第一次挂载留下的 fiber 停在“失败”，第二次的已激活。第二次只传了 `text`，`name` 和 `order` 由默认值补全。

dsh 对插件有一条规则：**插件里没有硬编码的可调参数**。随部署变化的选择都应该是经过校验的 `Config` 字段，用户可以在 `cordis.yml` 里修改；一个 `DEFAULT_*` 常量不算可配置。另一条规则是**配置错误要响亮失败**：能在加载时发现的错误就在加载时报出来，就像这里。

上游 system-prompt 插件自己也是这样配置的，前面几课传给它的 `includeHarnessIdentity`、`personaPrefix` 都是它的 `Config` 字段。
