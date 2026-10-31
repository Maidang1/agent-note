#!/usr/bin/env python3
"""批量实跑所有课程 JSON：默认 code 应 exit 0；debug.code 应 exit!=0 且错误类名匹配。

每条都在独立子进程里跑（PYTHONPATH 指向本项目 runtime/），记录
stdout/stderr/exit_code/elapsed_ms，输出 JSON 记录到 selfcheck/run-records.json。
不伪造输出；任何一步失败都会在汇总里标 FAIL，退出码非 0。
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = ROOT / "runtime"
# 解释器优先级与 launcher/backend 一致：TUTORIAL_PYTHON -> 项目 .venv -> 旁侧 .tutorial-venv -> sys.executable
def _resolve_py() -> Path:
    import os
    env = os.environ.get("TUTORIAL_PYTHON")
    if env:
        return Path(env)
    for rel in (".venv/bin/python", "../.tutorial-venv/bin/python"):
        cand = (ROOT / rel).absolute()
        if cand.exists():
            return cand
    return Path(sys.executable)

PY = _resolve_py()

# 课程 canonical 内联在工程内（scripts/lesson_json）；默认不依赖作者 session 绝对路径。
SOURCES = [ROOT / "scripts" / "lesson_json"]


def collect_jsons() -> list[Path]:
    out = []
    seen = set()
    for d in SOURCES:
        if not d.exists():
            continue
        for p in sorted(d.glob("*.json")):
            if p.name == "run-records.json":
                continue
            if p.name in seen:
                continue
            seen.add(p.name)
            out.append(p)
    return out


def run_py(code: str, timeout: int = 45) -> dict:
    t0 = time.time()
    try:
        proc = subprocess.run(
            [str(PY), "-c", code],
            cwd=str(RUNTIME.parent),  # cwd=runtime 的父目录，PYTHONPATH 指向 runtime
            env={"PATH": os_path_env(), "PYTHONPATH": str(RUNTIME), "PYTHONDONTWRITEBYTECODE": "1"},
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            "exit_code": proc.returncode,
            "stdout": proc.stdout[-8000:],
            "stderr": proc.stderr[-8000:],
            "elapsed_ms": int((time.time() - t0) * 1000),
            "timed_out": False,
        }
    except subprocess.TimeoutExpired as e:
        return {
            "exit_code": -1,
            "stdout": (e.stdout or "")[-4000:] if isinstance(e.stdout, str) else "",
            "stderr": (e.stderr or "")[-4000:] if isinstance(e.stderr, str) else "",
            "elapsed_ms": int((time.time() - t0) * 1000),
            "timed_out": True,
        }


def os_path_env() -> str:
    import os
    return os.environ.get("PATH", "/usr/bin:/bin")


def main() -> int:
    records = []
    failures = []
    for jp in collect_jsons():
        data = json.loads(jp.read_text(encoding="utf-8"))
        lid = data.get("id", jp.stem)
        title = data.get("title", "")
        # 默认 code
        res = run_py(data["code"])
        ok_default = res["exit_code"] == 0 and not res["timed_out"]
        records.append({"id": lid, "title": title, "kind": "default", **res, "PASS": ok_default})
        status = "PASS" if ok_default else "FAIL"
        print(f"[{lid}] default -> exit={res['exit_code']} {res['elapsed_ms']}ms {status}")
        if not ok_default:
            failures.append((lid, "default", res["stderr"][-500:]))
        # debug.code（预期非 0）
        dbg = data.get("debug") or {}
        dcode = dbg.get("code")
        if dcode:
            dres = run_py(dcode)
            expect = (dbg.get("expectedError") or "").strip()
            # 期望：非 0 退出，且抛出了预期的异常类别。
            # torch 各版本报错文案会变，因此按「异常类名」判定，而非整串子串。
            import re
            err_text = (dres["stderr"] or "") + (dres["stdout"] or "")
            m = re.search(r"([A-Za-z_]\w*(?:Error|Exception))", expect)
            exc_cls = m.group(1) if m else ""
            class_hit = (not exc_cls) or (exc_cls in err_text)
            # 若 expect 写了更长的关键词，也允许额外要求关键短语命中（全角括号说明不算）。
            matched = (dres["exit_code"] != 0) and class_hit
            records.append({"id": lid, "title": title, "kind": "debug", **dres, "expectedError": expect, "PASS": matched})
            dstatus = "PASS" if matched else "FAIL"
            print(f"[{lid}] debug   -> exit={dres['exit_code']} expect={expect or 'any-error'} {dstatus}")
            if not matched:
                failures.append((lid, "debug", dres["stderr"][-500:]))

    outdir = ROOT / "tests" / "reports"
    outdir.mkdir(parents=True, exist_ok=True)
    out = outdir / "run-records.json"
    out.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    # 每条写独立日志，便于审查
    for r in records:
        (outdir / f"{r['id']}-{r['kind']}.log").write_text(
            f"# {r['id']} {r['title']} ({r['kind']})  exit={r['exit_code']} {r['elapsed_ms']}ms PASS={r['PASS']}\n"
            f"--- stdout ---\n{r.get('stdout','')}\n--- stderr ---\n{r.get('stderr','')}\n",
            encoding="utf-8",
        )
    print(f"\n=== 汇总：{len(records)} 条，失败 {len(failures)} ===")
    for lid, kind, tail in failures:
        print(f"  FAIL {lid}/{kind}: {tail[:200]}")
    print(f"记录写入: {out}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
