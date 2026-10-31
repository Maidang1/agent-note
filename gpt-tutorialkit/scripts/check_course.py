#!/usr/bin/env python3
"""课程自检：每课的参考答案必须全部通过，初始代码必须至少有一条不通过。

    .venv/bin/python scripts/check_course.py            # 全部
    .venv/bin/python scripts/check_course.py 05 12      # 只跑编号以这些开头的课

和后端 /check 用同一个判题入口（tutorial_runtime.grader），每份代码在独立临时目录、独立进程里跑。
结果写入 tests/reports/course-check.json。
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from coursecode import derive

ROOT = Path(__file__).resolve().parent.parent
COURSE = ROOT / "course"
REPORT = ROOT / "tests" / "reports" / "course-check.json"
TIMEOUT = 40  # 与后端单次运行上限一致


def python() -> str:
    env = os.environ.get("TUTORIAL_PYTHON")
    if env:
        return env
    venv = (ROOT / ".venv" / "bin" / "python").absolute()
    return str(venv) if venv.exists() else sys.executable


def grade(lesson: Path, code: str) -> dict:
    with tempfile.TemporaryDirectory(prefix="coursecheck_") as tmp:
        Path(tmp, "lesson.py").write_text(code, encoding="utf-8")
        t0 = time.time()
        try:
            proc = subprocess.run(
                [python(), "-m", "tutorial_runtime.grader", str(lesson / "check.py"), "lesson.py", "result.json"],
                cwd=tmp, capture_output=True, text=True, timeout=TIMEOUT,
                env={"PATH": os.environ.get("PATH", ""), "PYTHONPATH": str(ROOT / "runtime"),
                     "PYTHONDONTWRITEBYTECODE": "1"},
            )
        except subprocess.TimeoutExpired:
            return {"checks": None, "seconds": TIMEOUT, "stderr": "超时"}
        result = Path(tmp, "result.json")
        return {
            "checks": json.loads(result.read_text(encoding="utf-8")) if result.exists() else None,
            "seconds": round(time.time() - t0, 1),
            "stderr": proc.stderr[-2000:],
        }


def verify(lesson: Path) -> dict:
    starter, solution = derive((lesson / "code.py").read_text(encoding="utf-8"))
    sol, sta = grade(lesson, solution), grade(lesson, starter)
    problems = []
    if not sol["checks"]:
        problems.append("答案没跑完判题：" + sol["stderr"].strip()[-400:])
    else:
        problems += [f"答案未通过「{c['name']}」：{c['msg']}" for c in sol["checks"] if not c["ok"]]
    if not sta["checks"]:
        problems.append("初始代码没跑完判题：" + sta["stderr"].strip()[-400:])
    elif all(c["ok"] for c in sta["checks"]):
        problems.append("初始代码竟然全部通过：检查项没有覆盖到 TODO")
    if "TODO(" not in starter:
        problems.append("初始代码里没有 TODO")
    return {
        "lesson": lesson.name,
        "ok": not problems,
        "problems": problems,
        "solution_seconds": sol["seconds"],
        "starter_seconds": sta["seconds"],
        "checks": [c["name"] for c in sol["checks"] or []],
    }


def main(prefixes: list[str]) -> int:
    lessons = sorted(p for p in COURSE.iterdir() if p.is_dir() and p.name[:2].isdigit()
                     and (not prefixes or any(p.name.startswith(x) for x in prefixes)))
    with ThreadPoolExecutor(max_workers=4) as pool:
        records = list(pool.map(verify, lessons))
    for r in records:
        mark = "PASS" if r["ok"] else "FAIL"
        print(f"{mark}  {r['lesson']:<28} 答案 {r['solution_seconds']:>5}s  初始 {r['starter_seconds']:>5}s  {len(r['checks'])} 项检查")
        for p in r["problems"]:
            print(f"      - {p}")
    if not prefixes:
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    failed = [r for r in records if not r["ok"]]
    print(f"\n{len(records) - len(failed)}/{len(records)} 课通过自检")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
