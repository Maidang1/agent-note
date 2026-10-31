"""判题入口：python -m tutorial_runtime.grader <check.py> <lesson.py> <result.json>

1. 先像「运行」一样执行学习者的 lesson.py（输出照常打到 stdout/stderr）；
2. 再加载该课 check.py 里用 @check 声明的检查项，逐条拿学习者的命名空间去测；
3. 把 [{name, ok, msg}] 写进 result.json，由后端回传给前端逐条展示。

即使学习者代码中途报错，已定义出来的函数/类仍会被逐条检查，方便定位是哪一块没写对。
"""

from __future__ import annotations

import importlib.util
import json
import sys
import traceback

from . import checking
from .todo import TodoNotDone


def _short_tb(exc: BaseException) -> None:
    """只打印学习者文件里的栈帧，原版/运行时内部帧折叠掉。"""
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == "lesson.py"]
    if frames:
        print("Traceback（只显示 lesson.py 中的行）:", file=sys.stderr)
        print("".join(traceback.format_list(frames)), end="", file=sys.stderr)
    print(f"{type(exc).__name__}: {exc}", file=sys.stderr)


def _describe(exc: BaseException) -> str:
    if isinstance(exc, TodoNotDone):
        return str(exc)
    if isinstance(exc, checking.CheckFailed):
        return str(exc)
    return f"{type(exc).__name__}: {exc}"


def main(argv: list[str]) -> int:
    check_path, lesson_path, out_path = argv
    results: list[dict] = []

    with open(lesson_path, encoding="utf-8") as f:
        src = f.read()
    L: dict = {"__name__": "__main__", "__file__": "lesson.py"}
    try:
        exec(compile(src, "lesson.py", "exec"), L)  # noqa: S102 - 判题就是执行学习者代码
        results.append({"name": "整份代码从头跑到尾不报错", "ok": True, "msg": ""})
    except BaseException as exc:  # noqa: BLE001 - 任何异常都转成一条检查结果
        if isinstance(exc, KeyboardInterrupt):
            raise
        _short_tb(exc)
        results.append({"name": "整份代码从头跑到尾不报错", "ok": False, "msg": _describe(exc)})

    checking._registry.clear()
    spec = importlib.util.spec_from_file_location("lesson_check", check_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    for name, fn in list(checking._registry):
        try:
            note = fn(L)
            results.append({"name": name, "ok": True, "msg": note or ""})
        except (checking.CheckFailed, TodoNotDone) as exc:
            results.append({"name": name, "ok": False, "msg": _describe(exc)})
        except Exception as exc:  # noqa: BLE001
            _short_tb(exc)
            results.append({"name": name, "ok": False, "msg": "检查时你的代码抛出异常：" + _describe(exc)})

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False)
    return 0 if all(r["ok"] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
