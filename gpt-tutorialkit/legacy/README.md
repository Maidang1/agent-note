# legacy：旧版 32 课（已停用）

改版前的「读代码 + 运行」式课程，留作参考，不参与构建：

- `scripts/lesson_json/`：旧课程内容（每课一个 JSON）
- `scripts/build_lessons.py`、`scripts/run_lessons.py`：旧的生成 / 批量运行脚本
- `tests/verify_walkthrough.py`、`tests/reports/`：旧的走查脚本和报告

脚本按自身位置定位根目录，在这里运行只会写到 `legacy/` 下，不会覆盖现在的 `astro/src/content/tutorial`。
