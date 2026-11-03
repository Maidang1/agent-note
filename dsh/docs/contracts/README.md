# 行为契约

每个契约用 `### <ID> 名称` 作为标题。字段按 `05-validation-and-release.md` §2 的模板填写；“验证”一栏指向实际测试。上游依据均指固定 commit `687f282e8625c6b8d11ff58211a90524be2e4317`。

| 文件 | 范围 |
|---|---|
| [cordis.md](cordis.md) | CTX、LIFE、EVT：依赖、作用域、生命周期、事件分发 |
| [prompt.md](prompt.md) | PROMPT：提示词片段的注册、覆盖与移除 |
| [turn-tool.md](turn-tool.md) | TURN、TOOL：一轮对话与工具调用 |
| [host.md](host.md) | TRACE、BUILD、HOST、SEC、OBS：轨迹、构建、运行宿主与安全（历史） |

状态取值：`verified`（有通过的测试）、`partial`（部分分支已验证）、`planned`（尚未实现）。

> 历史文档：Explorer 改版为 TutorialKit 教程后（[0003](../decisions/0003-tutorialkit.md)），`apps/`、`packages/` 与 `fixtures/` 下的运行时和测试都已删除，各契约“验证”栏指向的测试只作历史记录。教程课程的行为由 `apps/tutorial/tests/lessons.spec.ts` 验证。
