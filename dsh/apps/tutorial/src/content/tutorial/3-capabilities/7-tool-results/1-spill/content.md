---
type: lesson
title: 结果太长，存到文件里
focus: /main.ts
terminal:
  open: true
  activePanel: 0
  panels: [['output', '输出'], ['terminal', '终端']]
---

# 结果太长，存到文件里

工具的输出可能很长：一次 `read_log` 返回 300 行日志，将近 10 KB。这些内容会原样进入下一次请求，此后每一步都要带着它，上下文很快就满了。

上游的 spill 家族把这件事拆成两块：

- `dsh-spill-policy`：策略。工具结果超过预算，就换成首尾预览，再加一行提示，告诉模型完整结果存在哪里。
- `dsh-spill-local`：存储后端。把完整结果写成本机上的一个文件，注册为 `ctx.spillStore` 服务。

## 现在的情况

```text
[response] #1  调用 read_log({})
[warn] spill-policy  spill-policy: Error: no ctx.spillStore backend loaded; keeping the inline content
[response] #2  日志看完了
模型看到的工具结果：9908 字节，看得到 ERROR 那一行
```

策略已经挂上，预算是 200 token，结果却一个字也没少。策略要先把完整结果存起来才能裁，而这里没有存储后端。它不会因此让工具调用失败，只记一条警告（终端里的 `[warn]` 行），保留原文（节选自[上游 spill-policy](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/spill/spill-policy/src/index.ts#L101-L102)）：

```ts
const spillStore = ctx.get('spillStore')
if (spillStore === undefined) throw new Error('no ctx.spillStore backend loaded')
```

这个错误在同一个函数里被接住，变成那条 `logger.warn`，结果原样放行（[上游 spill-policy](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/spill/spill-policy/src/index.ts#L127-L130)）。存不下完整内容就不裁：宁可上下文大一些，也不能让模型丢掉找不回来的内容。

## 动手

在 TODO 处挂上本地后端：

```ts
await harness.plugin(LocalSpillStore)
```

再运行：

```text
模型看到的工具结果：730 字节，看不到 ERROR 那一行
结尾的提示： (Omitted 9424 bytes. Full formatted result stored at: <路径>. Use read with offset/limit, or grep this path to search within it.)
完整结果文件：300 行，ERROR 在第 218 行：12:03:37 ERROR db.query timeout after 30s
```

模型看到的结果从 9908 字节降到 730 字节：开头几行、`[...]`、结尾几行，最后一行提示。真实路径每次运行都不一样，这里换成了 `<路径>`。

## 被省掉的那一行

ERROR 在第 218 行，正好落在被省掉的中间。只看预览，模型不知道有这一行。

所以提示里给了路径，还说明了怎么用：用 `read` 按行号分段读，或者用 `grep` 搜。`main.ts` 最后做的就是这件事：打开路径指向的文件，300 行都在，ERROR 在第 218 行。真实部署里，这一步由模型调用读文件和搜索的工具完成。

这也说明了 spill 的取舍：上下文省下来了，代价是模型要多走一步才能看到细节。预算太小，模型就得频繁回头去读文件。

## 日志里存的是哪一份

策略挂在 `tools/post-execute` 上，用 `prepend: true` 排在最前，先调用 `next()` 让其他监听器做完决定，再裁剪最终接受的内容（[上游 spill-policy](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/spill/spill-policy/src/index.ts#L133-L150)）。它返回的是新的 `content`，所以写进会话日志的 `tool/result` 就是裁剪后的版本，`main.ts` 读到的 730 字节正是从日志里取的。

这符合“模型可见即已记录”：日志里记的就是模型看到的那一份，完整内容在 spill 文件里，日志通过提示里的路径指向它。

有一个例外：工具名是 `read` 的结果不裁（同一段代码里的 `exec.name === 'read'`）。模型照着提示用 `read` 回头读文件，如果读出来的结果又被 spill 一次，就会在两个文件之间来回绕。

## 文件放在哪

`LocalSpillStore` 不配置 `root` 时，在系统临时目录下建一个只有当前用户能读写的私有目录，每个会话一个子目录（[上游 spill-local](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/spill/spill-local/src/index.ts#L30-L58)）。文件不会随会话结束删除：恢复的会话可能还引用着旧路径。插件每次启动时清理一次超过 `cleanupPeriodDays`（默认 30 天）的旧文件。
