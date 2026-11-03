# Harness Explorer

边读讲解边改代码，从架构层面学习 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）。

教程基于 [TutorialKit](https://tutorialkit.dev)：左边是讲解，右边是编辑器和**流程图**。流程图分五层（根作用域、基础服务、能力、扩展、编排），节点是插件，连线是依赖、注册和数据流，全部从运行中的 Cordis 根读出来。“内核架构”部分从一个空的根开始，每挂一个插件图上就多一个节点；之后每一课都在图上找到自己讲的机制，可以逐帧回放一轮对话；“插件实战”的最后一课画出完整的图，“上游能力插件”再把上游现成的插件挂上去。

流程图默认是**简明模式**：点任意节点能看到一句大白话说明，每一步下面也有说明，连续的会话日志事件合成一步“写入会话日志 ×N”；点“完整步骤”可以逐条看。

每一课给出一段能运行的代码和一个小练习，改完代码，流程图和终端里就是上游内核的真实行为；“查看答案”会换上参考答案并重新运行。

课程代码在本机的 Node.js 上运行：页面里的编辑器、终端和流程图经过一个本机运行时，把文件写到 `.cache/lesson-workspace/`，在那里执行命令。挂载的是 npm 上发布的 `@deepseek-ai/dsh-*@0.2.1-rc.2`，即上游固定 commit `687f282e` 的发布（标签 `dsh-v0.2.1-rc.2`），不复制、不改写。模型是确定性的脚本适配器，不需要 API 密钥。

## 课程

**从零开始**，给会写代码、但没接触过 agent 的读者：

| 章 | 课 |
|---|---|
| agent 是什么 | 一个 agent 在做什么 · 读懂课程代码 |

**内核架构**，对应[架构系列文章](docs/blog/README.md)的七篇：

| 章 | 课 |
|---|---|
| 一切皆插件 | 从一个空的根开始 · 依赖决定层次 · agent loop 也是插件 · 加一个工具插件 |
| Cordis 基础 | 服务与 inject · effect：注册即可撤销 · waterfall：环绕中间件 |
| 组合与启动 | 配置行、patch 与依赖 |
| 一个轮次的一生 | 轮次与步骤 · pre-step：接纳还是拒绝 · 一步里的多个工具调用 · 打断：工具要接住 signal |
| 会话日志 | 模型可见即已记录 |
| 提示词组装与工具流水线 | 系统提示词是组装出来的 · 工具流水线：谁可以说不 |
| 能力 seam | 换一个模型提供方 |

**插件实战**，每章从零写一个插件：

| 章 | 课 |
|---|---|
| 提示词贡献插件 | 插件入口与依赖 · 贡献片段与配置 · 卸载即清理 · 作用域内的覆盖 |
| 工具守卫插件 | 两层监听器 · 短路拒绝 · 只限制一个 agent |
| 运行时上下文插件 | 会变的事实放进上下文 |
| 完整的流程图 | 把前面的插件挂到一起 |

**上游能力插件**，把上游现成的插件挂上去，看它们解决什么问题：

| 章 | 课 |
|---|---|
| 人工审批 | 把 ask 交给应答者 · never 策略：无人值守时一律拒绝 |
| 会话持久化 | 落盘与恢复 · 先落盘再动手 |
| 重试与计量 | 暂时的失败交给重试 · token 预算：超了就停 |
| 上下文压缩 | 上下文快满了：用摘要换掉旧对话 |
| 子 agent | 把一件事委派给子 agent |
| MCP | 接一台 MCP 服务器 · 远端服务器：HTTP 与鉴权 |
| 工具结果太大 | 结果太长，存到文件里 · 压力来了，先裁旧结果 |
| 守卫 | 原地打转时提醒一下 · 给工具设一个时间上限 |
| 测试 | 录一次，回放很多次 |

## 快速开始

需要 Node.js 22.19 或更高版本与 pnpm 10。

```sh
pnpm install
pnpm start        # 构建后启动 http://localhost:4321
```

开发时用 `pnpm dev`（Astro 开发服务器，同样在 4321 端口）。两者都在本机运行课程代码，不需要联网；流程图预览占用 4300 端口。一次只开一个教程标签页：新打开的页面会结束上一个页面运行的进程。

交互终端用的是 [node-pty](https://github.com/microsoft/node-pty)：macOS 和 Windows 有预编译包，Linux 上 `pnpm install` 需要 python3、make 和 g++。

不开浏览器也能运行一课：

```sh
pnpm lesson                                   # 列出全部课程
pnpm lesson 2-tool-pipeline                   # 运行起始代码
pnpm lesson 2-tool-pipeline --solution        # 运行答案
```

## 开发命令

| 命令 | 作用 |
|---|---|
| `pnpm typecheck` | 仓库代码的类型检查，外加每一课起始代码和答案与模板合成后的类型检查 |
| `pnpm test` | Vitest：每一课的起始代码和答案都运行一遍并检查输出和流程图 |
| `pnpm lessons:verify-upstream` | 核对文档和课程里的上游链接都指向固定 commit 且路径存在，模板依赖版本与根目录一致（会克隆上游到 `.cache/`，或使用 `UPSTREAM_DIR`） |
| `pnpm build` | 构建教程站点到 `apps/tutorial/dist` |
| `pnpm test:e2e` | Playwright：站点渲染、经本机运行时运行一课并查看答案、交互终端、axe 无障碍检查（需先 `pnpm build`） |
| `pnpm check` | 按 CI 的顺序运行以上全部检查 |

## 目录

```text
apps/tutorial/src/content/tutorial   课程：每课一个目录，content.md、_files（起始代码）、_solution（答案）
apps/tutorial/src/templates/default  所有课程共用的模板：上游依赖、课程运行器 harness/ 与流程图 harness/diagram/
apps/tutorial/runtime                本机运行时：@webcontainer/api 的替身、WebSocket 服务、pnpm start 的站点服务器
apps/tutorial/scripts                在本机 Node 上合成并运行课程、类型检查课程
apps/tutorial/tests                  课程输出与流程图测试
apps/tutorial/e2e                    浏览器端到端测试
docs/blog                            架构系列文章
docs/decisions                       技术决定
```

写新课程的方法见[课程制作指南](docs/authoring.md)。

## 文档

- [从架构读懂 DeepSeek Harness](docs/blog/README.md)：7 篇架构文章，教程第一部分的底稿。
- 技术决定：[0001 上游基线与复用范围](docs/decisions/0001-upstream-baseline-and-reuse.md)、[0002 直接运行上游发布的内核包](docs/decisions/0002-run-upstream-packages.md)、[0003 用 TutorialKit 重写教学界面](docs/decisions/0003-tutorialkit.md)、[0004 以流程图为中心组织课程](docs/decisions/0004-flowchart.md)、[0005 课程代码在本机运行](docs/decisions/0005-local-runtime.md)。
- [文档总览](docs/README.md)，包括 Explorer 时期的设计文档。

## 来源与许可

学习对象：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（MIT）。内核插件 `@deepseek-ai/dsh-*@0.2.1-rc.2` 与框架包 `@deepseek-ai/cordis`、`@deepseek-ai/schemastery` 均以 MIT 许可从 npm 原样引入。课程里的插件、计算器工具、确定性模型适配器和课程运行器是本项目编写的教学代码。许可证原文与依赖说明见[第三方声明](THIRD_PARTY_NOTICES.md)。
