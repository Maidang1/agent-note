# 文档总览

Harness Explorer 现在是一个 TutorialKit 教程站点：在本机运行上游发布的 dsh 内核，边读讲解边改代码，预览面板里的流程图跟着代码一步步画出整个内核。改版的原因、做法和取舍见 [0003 用 TutorialKit 重写教学界面](decisions/0003-tutorialkit.md)。

## 当前文档

| 文档 | 内容 |
|---|---|
| [从架构读懂 DeepSeek Harness](blog/README.md) | 7 篇架构文章，教程“内核架构”部分按它组织（基线 dsh-v0.2.1-rc.2） |
| [课程制作指南](authoring.md) | 课程目录结构、课程运行器、制作步骤与发布前检查 |
| [0001 上游基线与复用范围](decisions/0001-upstream-baseline-and-reuse.md) | 固定 commit 的选择 |
| [0002 直接运行上游发布的内核包](decisions/0002-run-upstream-packages.md) | 为什么运行 npm 发布包，而不是教学子集 |
| [0003 用 TutorialKit 重写教学界面](decisions/0003-tutorialkit.md) | 当前的界面、运行环境与验证方式 |
| [0004 以流程图为中心组织课程](decisions/0004-flowchart.md) | 预览面板里的分层流程图，以及课程怎样一步步画出它 |
| [0005 课程代码在本机运行](decisions/0005-local-runtime.md) | 用本机运行时替换 WebContainer，保留 TutorialKit 界面 |

## Explorer 时期的设计文档

下面这些文档描述的是被 0003 取代的 Explorer：插件树、Code Hike 课程、本地控制服务、回放与对比。它们对应的代码已经删除，保留作为历史记录，不再更新。

1. [产品设计与范围](01-product-design.md)
2. [系统架构与状态数据模型](02-technical-architecture.md)
3. [Code Hike 与插件教学内容实现](03-code-hike-and-plugin-lessons.md)
4. [分阶段实施计划与任务验收](04-implementation-plan.md)
5. [行为一致性验证与发布标准](05-validation-and-release.md)
6. [上游依据与待验证事项](06-source-baseline.md)
7. [内核插件课程方案](07-kernel-plugin-lessons.md)

[行为契约](contracts/README.md)、`design/` 与 `generated/` 下的界面稿、实施状态和性能记录同属这一时期。
