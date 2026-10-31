# 迁移记录（new-current）

- 迁移时间：2026-10-30
- 源：`/Users/bytedance/DoubaoWork/chats/2026-10-30/new-chat-1/gpt-tutorialkit`（已 `mv` 移走，旧位置不存在）
- 目标：`/Users/bytedance/codes/myself/70days/gpt-tutorialkit`（本工程当前位置）
- 未触碰：70days 既有 `.git`、`AI 量化分析/`、`illustrated-transformer/`；不做 git 提交。

## 解释器
- 新建项目内独立 `.venv`（Python 3.14.7），实装 torch 2.15.0 / numpy 2.5.4，CPU。
- `launcher.resolve_python()` / `backend._resolve_python()` / `scripts/run_lessons.py` 统一优先级：
  `TUTORIAL_PYTHON` → 项目 `.venv/bin/python` → 旁侧 `../.tutorial-venv/bin/python` → `sys.executable`。
  实测 `resolve_python()` 返回本工程 `.venv/bin/python`，真实子进程 `sys.executable` 即该 venv，import torch=2.15.0。
- 旧旁侧 `.tutorial-venv` 保持只读、未整体移动。

## 自包含
- 课程 canonical（JSON/mdx、runtime 原版与随附语料、scripts、backend、launcher、node_modules）均在本工程内。
- `tests/reports/*.json` 内的旧绝对路径属历史日志，按要求保留为历史；不影响运行。

## 迁移后实测
- `./run.sh`：backend 监听 127.0.0.1:8765，astro 监听 127.0.0.1:4321，`/health` ok。
- 后端 `/run`（Origin 白名单）：exit 0，torch 2.15.0 numpy 2.5.4 cpu，bigram+gpt 两模型 load ok，tensor sum 正确。
- 浏览器入口（首课）：导航 32 课顺序正确（第14课=q·k 亲密度矩阵）；「运行」退出码 0、参数对照正确、种子可复现；「重置」清空输出区。

## 已知未闭环
- 终端 Ctrl-C 整条停止路径未经实测（本非交互环境后台收不到信号）；组清理逻辑已程序验证（仅对自启 pgid killpg）。
