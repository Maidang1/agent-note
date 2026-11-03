# 课程制作指南

教程站点是 `apps/tutorial`（TutorialKit），课程内容都在 `apps/tutorial/src/content/tutorial/` 下。新课程只增加内容目录，不修改运行器。背景见 [0003](decisions/0003-tutorialkit.md) 和 [0004](decisions/0004-flowchart.md)。

## 1 目录结构

```text
src/content/tutorial/
  meta.md                       教程级配置：运行命令、流程图预览、终端面板、界面文案
  1-kernel/meta.md              部分（type: part）
  1-kernel/4-turns/meta.md      章（type: chapter）
  1-kernel/4-turns/2-pre-step/  课
    content.md                  讲解，frontmatter 写 type: lesson、title、focus
    _files/                     起始代码：至少有 main.ts
    _solution/                  答案：只放和 _files 不同的文件
src/templates/default/          所有课共用的模板，学习者在编辑器里看不到
  package.json                  上游依赖（版本必须与仓库根目录一致）与 start 命令
  harness/                      课程运行器
  harness/diagram/              流程图：记录器、预览服务、布局与页面
```

目录名前的数字决定顺序。页面打开一课时，模板、`_files`（“查看答案”时再加 `_solution`）写进本机的 `.cache/lesson-workspace/`，课程命令在那里运行（见 [0005](decisions/0005-local-runtime.md)）。`_solution` 覆盖到 `_files` 之上，所以未改动的文件不用重复，`main.ts` 例外：答案里也放一份，方便本机直接运行。

## 2 课程运行器

`main.ts` 一般从 `createHarness()` 开始：

```ts
import { createHarness } from './harness/index.ts'

const harness = await createHarness({
  script: { id: 'echo', rules: [{ id: 'ok', match: {}, respond: { kind: 'text', chunks: ['好'] } }] },
  show: { events: true },
})
await harness.plugin(myPlugin, config)   // 挂载并等待激活，返回 fiber
await harness.send('你好')                // 发一条用户消息，等这一轮结束
await harness.dispose()
```

- 它在一个新的 Cordis 根上挂载上游 sdk-minimal 的七个内核插件（`kernel`）和确定性模型 `llm-scripted`。`kernel: []` 从空根开始（第一章用它逐个挂出内核），`kernel: ['session', 'llm']` 只挂其中几个；不传 `script` 就不挂模型适配器。
- `script.rules` 按顺序匹配每一次模型请求：`lastUserText`、`userIncludes`、`systemIncludes`、`declaredTools`、`afterToolResult`（`true` 表示任意工具结果）。没有规则匹配时，这一轮以错误结束。
- `show` 控制终端打印哪些内容：请求（默认开）、全部消息、响应（默认开）、会话事件、`harness.plugin()` 挂上的插件及其状态（`plugins`）。
- `harness.agent(sessionId, setup)` 用 `setup(agentCtx, agent)` 在 agent 发布前往它的作用域注册东西。
- `checkpoint(ctx, name, data)` 是本项目的约定，不是上游 API：插件在关键位置调用，终端按发生顺序打印，流程图把它画成发出它的插件上的一步。
- `stateOf(fiber)`、`settle()` 用于不经过对话、直接观察 Cordis 状态的课程。这类课程自己 `new Context()`，要调用 `draw(root)` 把根交给流程图，否则预览是空的。

## 2.1 流程图

`createHarness()` 创建的根会自动交给流程图（`harness/diagram/`）。它的数据全部从运行时读出：

- **节点**是具名 fiber。层次：内核插件按固定表放；其余插件提供服务又依赖服务的在 L2，只提供服务的在 L1，只依赖 `llm` 的在 L2，其他在 L3。课程目录里的插件带“课程”标签，agent 作用域显示为 `agent <会话>`。
- **依赖**视图画 `inject`，**注册**视图画插件登记到服务上的东西和监听的事件，**数据流**视图逐步回放一轮对话。
- **简明模式**（默认）把连续的 `session/event` 合成一步 `log`，标签是“写入会话日志 ×N”，回放时跳过被合并的帧；节点和步骤的大白话说明在 `harness/diagram/glossary.js`。新课程引入新插件时，在 `NODES` 里给它加一句说明，否则只显示按服务推出的通用说明；引入新的会话事件类型时，加到 `LOG_TYPES`。讲解里引用具体的 `session/event · …` 步骤时，提醒读者切到“完整步骤”。
- 预览服务由模板的 `start` 命令预加载（页面里运行课程时）；`pnpm lesson` 和测试不启动它，`LESSON_DIAGRAM_OUT=<文件>` 可以把时间线写成 JSON。

写讲解时，先在本机用 `LESSON_DIAGRAM_OUT` 或浏览器确认图上实际出现了什么，再写“流程图上……”。终端默认收起，讲解里引用终端输出时提醒读者展开；如果一课只能靠终端讲清楚，在 frontmatter 里设 `terminal.open: true`（要连同 `panels` 一起写）。

运行器只观察，不改变调用顺序和返回值。新课程需要的观察能力优先加到 `harness/` 里，让所有课程共用。

## 3 制作步骤

1. **只选一个机制。** 在固定 commit 的上游代码和 README 里确认它的行为，最好先在本机写个小脚本跑一遍。迁移中至少有三条旧说法被实际运行推翻（见 0003）。
2. **设计“问题 → 修正”。** 起始代码要能运行，并且输出直接暴露问题：漏了依赖插件进入 `failed`、片段在卸载后还在、系统提示词每轮都变。答案只改几行，修正后的输出和问题形成对照。练习放在 `// TODO：` 注释处。
3. **写 `content.md`。** 先说现在的输出说明了什么，再给出要改的代码，最后解释为什么。引用上游代码时注明“节选自上游 xxx”；上游 README 的原话用引用块。遵守仓库的中文写作约定：中英文之间留空格，用“”引号，短句。
4. **登记预期输出。** 在 `apps/tutorial/tests/lessons.spec.ts` 的 `expectations` 里为两份代码各写几个必须出现、不能出现的片段。讲解里提到的图上变化也写进去：`nodes` 断言最后一帧的节点（`标签@层:状态`），`absent` 断言不该出现的节点，`flow` 按顺序断言数据流步骤（`步骤标签 → 接收方`）。测试要求每一课都有登记。
5. **本机运行和检查。**

```sh
pnpm lesson <课程路径的结尾>              # 起始代码
pnpm lesson <课程路径的结尾> --solution   # 答案
pnpm typecheck && pnpm test
```

6. **在浏览器里走一遍。** `pnpm dev`，确认流程图、终端输出、“查看答案”后的重新运行和讲解里引用的内容一致。

## 4 发布前检查

- [ ] 起始代码和答案的退出码都为 0，`pnpm test` 通过。
- [ ] `pnpm typecheck` 通过：课程代码与模板合成后能通过严格类型检查。
- [ ] 讲解里贴出的终端输出和实际输出一致，描述的流程图节点、连线和步骤和实际画出来的一致。
- [ ] 所有关于上游的说法都能在固定 commit 的代码、README 或实际运行中找到依据；解读和事实分开写。
- [ ] 上游链接使用固定 commit 的永久链接，`pnpm lessons:verify-upstream` 通过。
- [ ] 在 README 的课程表中登记。
