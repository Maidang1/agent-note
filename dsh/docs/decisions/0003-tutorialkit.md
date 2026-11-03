# 0003 用 TutorialKit 重写教学界面

状态：已采纳。日期：2026-10-31。取代 01–05、07 号设计文档描述的 Explorer 界面与本地服务；0002 关于直接运行上游发布包的决定继续有效。插件树和回放后来以流程图的形式回到了预览面板，见 [0004](0004-flowchart.md)；第 2、5 条由 [0005](0005-local-runtime.md) 修订，课程代码改在本机运行。

## 背景

Explorer 的主页是插件树：组合、依赖、运行数据三个图层，配合回放与对比。它能展示“发生了什么”，但学习者只是看图，没有写代码，教学价值有限。课程正文（`content/plugins/*/lesson.mdx`）和 `docs/blog/` 的七篇架构文章讲的是同一批机制，却分在两处。

## 决定

1. **界面换成 TutorialKit。** `apps/tutorial` 是一个 TutorialKit 1.6（Astro）站点：左边是讲解，右边是编辑器和终端。每一课有 `_files`（起始代码）和 `_solution`（答案），学习者改代码、看终端输出，“查看答案”替换文件后 `node --watch` 自动重新运行。
2. **课程在浏览器里真实运行上游包。** 课程代码运行在 WebContainer（浏览器内的 Node.js）里，模板 `package.json` 锁定 `@deepseek-ai/dsh-*@0.2.1-rc.2` 与 `@deepseek-ai/cordis@4.0.5`，`npm install` 后原样挂载，不打包、不改写。`lessons:verify-upstream` 核对模板依赖与仓库根目录一致。
3. **内容合并成两部分。** 第一部分“内核架构”按博客系列的七篇组织，每章一到三课；第二部分“插件实战”由原来的 prompt-contributor、tool-guard、system-prompt 三门课改写，每章从零写一个插件。课程正文按仓库写作约定，事实取自固定 commit 的发布包。
4. **课程运行器是模板里的普通代码。** `src/templates/default/harness/` 提供 `createHarness()`：在新的 Cordis 根上挂上游对话内核和确定性模型（一个注册在 `scripted` 路由上的上游 `LlmAdapter`），按顺序打印请求、响应、检查点和轮次结果。它只观察，不改变调用顺序和返回值。学习者看不到模板文件，但可以下载整个课程目录。
5. **WebContainer 的 AsyncLocalStorage 替身。** WebContainer 里的 `AsyncLocalStorage` 不跨 `await` 传播，上游 agent-loop 执行工具时调用的 `ctx.agents.requireInitiator()` 因此失败（“no initiating agent is active”）。`harness/async-context.ts` 启动时探测传播是否正常；不正常时用 `node:module` 的 `registerHooks` 把 `node:async_hooks` 重定向到单上下文实现 `harness/async-hooks-single.ts`。上游包本身不改。单上下文实现在 `run()` 返回的 Promise 结束时才恢复外层值，课程里同一时刻只有一个 agent 在运行，所以语义一致；并发运行多个 agent 的课程不能依赖它。
6. **验证。**
   - `apps/tutorial/tests/lessons.spec.ts`：每一课的起始代码和答案都在本机 Node 上运行，原生 ALS 和单上下文替身（`LESSON_ASYNC_CONTEXT=single`）各一次，检查退出码和关键输出。
   - `apps/tutorial/scripts/typecheck-lessons.ts`：把每一课与模板合成后做类型检查，纳入 `pnpm typecheck`。
   - `scripts/verify-upstream-links.ts`：文档和课程里的上游永久链接都指向固定 commit 且路径存在。
   - `apps/tutorial/e2e/`：构建后的站点在 Chromium 里渲染、在 WebContainer 里运行一课并查看答案、通过 axe 检查（TutorialKit 自带组件的已知问题按规则和选择器精确排除）。

## 删除的部分

`apps/explorer`（Next.js 界面）、`apps/local-server`（本地控制服务）、`packages/lesson-kit`（课程构建）、`content/`（MDX 课程）及其脚本，以及 Explorer 的运行时 `packages/contracts`、`trace`、`teaching-runtime`、`teaching-plugins` 和 `fixtures/`（组合、场景、模型脚本）连同它们的契约测试。随之去掉的功能：插件树、回放、请求对比、运行导出与导入、npm 附加包安装、真实模型模式。

课程讲到的上游行为由 `apps/tutorial/tests/lessons.spec.ts` 在课程输出上验证；其余契约（例如请求准备后取消的边界、轨迹记录）不再有测试，`docs/contracts/` 保留为历史记录。仓库根目录的运行依赖因此收窄到课程模板的九个包，`lessons:verify-upstream` 检查两者一致。

## 后果

- 学习者需要联网：WebContainer 首次进入课程时从 npm 安装上游包（本机测试约 20 秒）。WebContainer 在 Chromium 系浏览器上支持最好。
- 没有真实模型。API 密钥不应进入浏览器，课程全部使用确定性模型；需要真实模型的读者可以下载课程目录在本机运行。
- 课程能讲的只限于发布包公开的行为。迁移中重新核对了几条，旧课程的说法因此修正：
  - 配置不符合 `Config` 时，Cordis 在 `ctx.plugin()` 里同步抛出 `ValidationError`，插件不会进入 `failed`。
  - 被 `tools/pre-execute` 拒绝的调用仍然经过 `tools/post-execute`。
  - 运行时不检查 `LlmAdapter` 的流约定：工具参数传对象、只产出 `finish` 都不报错。
