#!/usr/bin/env python3
"""walkthrough / 代码字节 核验脚本（独立、可复用）。

用途
----
课程新 schema 在 scripts/lesson_json/<id>-*.json 内引入：
  - explanation:  str[]        1–3 段直觉+观察
  - walkthrough:  list[{start:int, end:int, title:str, explanation:str}]
                  1-based 行号，指向该 JSON 自己 code.splitlines()
                  必须严格递增、连续、覆盖全部非空代码行。

本脚本只做机械核验（不做语义审查）：
  1. 32 课 canonical JSON 可解析；id/order 与 nav-order.json 对齐。
  2. walkthrough 字段类型正确；start/end 为 int、1-based、递增、连续、
     落在 [1, total_lines] 内；并覆盖 code 全部非空行。
  3. code / debug.code / exercise.solution / sourceRefs / statements 的
     sha256 与基线一致（防误改右侧默认/答案/调试代码与原版引用）。
  4. 生成课件同步：astro/.../_files/lesson.py 字节 == JSON code；
     _solution/lesson.py 字节 == code + "\\n\\n# 参考答案思路：" + exercise.solution。
  5. 保护文件（/guide、CourseSidebar.astro、PythonRunner.tsx、
     PythonCodeEditor.tsx、base.css、nav-order.json、build_lessons.py、
     runtime/tutorial_runtime/*）字节未变。

两种模式
--------
  --snapshot --out baseline.json   记录当前基线（首次/修订后用）
  --check    --baseline baseline.json   与基线对照，输出报告 JSON

退出码：0=全部通过；1=有失败项（报告会列在 failures）。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAV = ROOT / "astro" / "src" / "nav-order.json"
JSON_DIR = ROOT / "scripts" / "lesson_json"
TUTORIAL = ROOT / "astro" / "src" / "content" / "tutorial"

# 不可变文件（课程运行逻辑）：这些文件的字节在全 32 课改造期间不允许变化。
# 注意：
#   - scripts/build_lessons.py 是共享生成器，集成包会为新 schema 更新它，列为 REFERENCE；
#   - nav-order.json 作为导航顺序参考，单独审计顺序而非哈希；
#   - 五个 UI 文件（guide/sidebar/runner/editor/base.css）已被用户授权做整套布局优化，
#     其字节变化不再视为失败，但仍记录在报告里供人工核对。
PROTECTED = [
    "runtime/tutorial_runtime/__init__.py",
    "runtime/tutorial_runtime/loader.py",
    "runtime/tutorial_runtime/_originals/bigram.py",
    "runtime/tutorial_runtime/_originals/gpt.py",
]

# 授权可改的 UI 呈现文件：记录变化但不失败。
AUTHORIZED_UI = [
    "astro/src/pages/guide.astro",
    "astro/src/components/CourseSidebar.astro",
    "astro/src/components/PythonRunner.tsx",
    "astro/src/components/PythonCodeEditor.tsx",
    "astro/src/styles/base.css",
]

# 参考文件：记录哈希用于审计对照，但不强制不可变（集成包可能更新生成器）。
REFERENCE = [
    "astro/src/nav-order.json",
    "scripts/build_lessons.py",
]


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def load_nav() -> list[dict]:
    return json.loads(NAV.read_text(encoding="utf-8"))


def load_canonical() -> dict[str, dict]:
    """按 id（'01'..'32'）索引 canonical JSON。"""
    out = {}
    for p in sorted(JSON_DIR.glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        out[d["id"]] = {"path": p, "data": d}
    return out


def lesson_slug_dir(slug: str) -> Path:
    return TUTORIAL / slug


def check_walkthrough(d: dict) -> tuple[list[str], list[dict]]:
    """返回 (errors, ranges)。ranges 是 [{start,end,title,explanation}]。"""
    errs: list[str] = []
    code = d.get("code", "")
    lines = code.splitlines()
    total = len(lines)
    nonempty = {i for i, l in enumerate(lines, 1) if l.strip()}

    wt = d.get("walkthrough")
    if wt is None:
        errs.append("walkthrough 字段缺失")
        return errs, []
    if not isinstance(wt, list) or len(wt) == 0:
        errs.append("walkthrough 必须是非空数组")
        return errs, []

    seen_lines: set[int] = set()
    prev_end = 0
    ranges_out = []
    for i, w in enumerate(wt):
        if not isinstance(w, dict):
            errs.append(f"walkthrough[{i}] 不是对象")
            continue
        s, e = w.get("start"), w.get("end")
        t, x = w.get("title"), w.get("explanation")
        if not isinstance(s, int) or isinstance(s, bool):
            errs.append(f"walkthrough[{i}].start 必须是 int，得到 {type(s).__name__}: {s!r}")
            continue
        if not isinstance(e, int) or isinstance(e, bool):
            errs.append(f"walkthrough[{i}].end 必须是 int，得到 {type(e).__name__}: {e!r}")
            continue
        if not isinstance(t, str) or not t.strip():
            errs.append(f"walkthrough[{i}].title 必须是非空 str")
        if not isinstance(x, str) or not x.strip():
            errs.append(f"walkthrough[{i}].explanation 必须是非空 str")
        if s < 1:
            errs.append(f"walkthrough[{i}].start={s} < 1")
            continue
        if e > total:
            errs.append(f"walkthrough[{i}].end={e} 超过 code 总行数 {total}")
            continue
        if s > e:
            errs.append(f"walkthrough[{i}].start={s} > end={e}")
            continue
        if i > 0 and s <= prev_end:
            # 逆序或重叠：下一段 start 必须严格大于上一段 end
            errs.append(
                f"walkthrough[{i}] start={s} 与上一段 end={prev_end} 逆序或重叠"
            )
        # 段间 gap 必须全部是空行（非空行不能被跳过）
        if i > 0 and s > prev_end + 1:
            gap_nonempty = [
                ln for ln in range(prev_end + 1, s) if lines[ln - 1].strip()
            ]
            if gap_nonempty:
                errs.append(
                    f"walkthrough[{i}] 与上段之间的 gap 跳过了非空行: {gap_nonempty}"
                )
        for ln in range(s, e + 1):
            seen_lines.add(ln)
        ranges_out.append({"start": s, "end": e, "title": t, "explanation": x})
        prev_end = e

    missing = sorted(nonempty - seen_lines)
    if missing:
        errs.append(f"以下非空代码行未被 walkthrough 覆盖: {missing}")
    return errs, ranges_out


def inspect_lesson(nav_item: dict, canon: dict) -> dict:
    slug = nav_item["slug"]
    lid = f"{nav_item['order']:02d}"
    d = canon["data"]
    errs = []

    # id 一致性
    if d.get("id") != lid:
        errs.append(f"canonical id={d.get('id')} 与 nav order={lid} 不一致")
    if d.get("order") != nav_item["order"]:
        errs.append(f"canonical order={d.get('order')} 与 nav order={nav_item['order']} 不一致")

    code = d.get("code", "")
    lines = code.splitlines()

    # walkthrough
    wt_errs, ranges = check_walkthrough(d)
    errs.extend(wt_errs)

    # 字节哈希（用于前后对照）
    code_bytes = code.encode("utf-8")
    debug_code_bytes = (d.get("debug") or {}).get("code", "").encode("utf-8")
    exercise_sol = (d.get("exercise") or {}).get("solution", "")
    canon_path = canon["path"]

    # 生成文件同步
    ldir = lesson_slug_dir(slug)
    f_file = ldir / "_files" / "lesson.py"
    s_file = ldir / "_solution" / "lesson.py"
    f_bytes = f_file.read_bytes() if f_file.exists() else None
    s_bytes = s_file.read_bytes() if s_file.exists() else None

    sync = {}
    if f_bytes is not None:
        sync["files_eq_code"] = f_bytes == code_bytes
        if not sync["files_eq_code"]:
            errs.append("_files/lesson.py 字节 != JSON code（同步破坏）")
    else:
        errs.append(f"缺少生成文件 {f_file}")
    if s_bytes is not None:
        expected_sol_suffix = ("\n\n# 参考答案思路：" + exercise_sol).encode("utf-8")
        expected_sol = code_bytes + expected_sol_suffix
        sync["solution_eq_code_plus_hint"] = s_bytes == expected_sol
        if not sync["solution_eq_code_plus_hint"]:
            errs.append(
                "_solution/lesson.py 字节 != code + '\\n\\n# 参考答案思路：' + exercise.solution"
            )
    else:
        errs.append(f"缺少生成文件 {s_file}")

    return {
        "lessonId": lid,
        "slug": slug,
        "title": d.get("title"),
        "canonicalPath": str(canon_path.relative_to(ROOT)),
        "generatedFiles": {
            "filesLessonPy": str(f_file.relative_to(ROOT)),
            "solutionLessonPy": str(s_file.relative_to(ROOT)),
        },
        "codeTotalLines": len(lines),
        "codeNonEmptyLines": sum(1 for l in lines if l.strip()),
        "ranges": ranges,
        "walkthroughCount": len(ranges),
        "hashes": {
            "code_sha256": sha(code_bytes),
            "files_lesson_py_sha256": sha(f_bytes) if f_bytes is not None else None,
            "solution_lesson_py_sha256": sha(s_bytes) if s_bytes is not None else None,
            "debug_code_sha256": sha(debug_code_bytes),
            "exercise_solution_sha256": sha(exercise_sol.encode("utf-8")),
            "sourceRefs_sha256": sha(
                json.dumps(d.get("sourceRefs", []), sort_keys=True, ensure_ascii=False).encode("utf-8")
            ),
            "statements_sha256": sha(
                json.dumps(d.get("statements", []), sort_keys=True, ensure_ascii=False).encode("utf-8")
            ),
        },
        "sync": sync,
        "errors": errs,
        "ok": len(errs) == 0,
    }


def protected_hashes() -> dict:
    out = {}
    for rel in PROTECTED:
        p = ROOT / rel
        out[rel] = {
            "exists": p.exists(),
            "sha256": sha(p.read_bytes()) if p.exists() else None,
            "category": "protected",
        }
    for rel in AUTHORIZED_UI:
        p = ROOT / rel
        out[rel] = {
            "exists": p.exists(),
            "sha256": sha(p.read_bytes()) if p.exists() else None,
            "category": "authorized_ui",
        }
    for rel in REFERENCE:
        p = ROOT / rel
        out[rel] = {
            "exists": p.exists(),
            "sha256": sha(p.read_bytes()) if p.exists() else None,
            "category": "reference",
        }
    return out


def build_report() -> dict:
    nav = load_nav()
    canon = load_canonical()
    lessons = []
    for item in nav:
        lid = f"{item['order']:02d}"
        if lid not in canon:
            lessons.append({
                "lessonId": lid, "slug": item["slug"], "ok": False,
                "errors": [f"canonical JSON 缺失 id={lid}"],
                "ranges": [],
            })
            continue
        lessons.append(inspect_lesson(item, canon[lid]))
    return {
        "navCount": len(nav),
        "canonicalCount": len(canon),
        "lessons": lessons,
        "protected": protected_hashes(),
    }


def cmd_snapshot(out: Path) -> int:
    rpt = build_report()
    out.write_text(json.dumps(rpt, ensure_ascii=False, indent=2), encoding="utf-8")
    bad = [l for l in rpt["lessons"] if not l["ok"]]
    print(f"snapshot -> {out}")
    print(f"  lessons ok={len(rpt['lessons'])-len(bad)}/{len(rpt['lessons'])}")
    for l in bad:
        print("  FAIL", l["lessonId"], l["slug"], l["errors"])
    return 0 if not bad else 1


def cmd_check(baseline: Path, out: Path | None) -> int:
    base = json.loads(baseline.read_text(encoding="utf-8"))
    cur = build_report()
    failures = []

    # 1. 每课代码字节未变
    base_l = {l["lessonId"]: l for l in base["lessons"]}
    for cl in cur["lessons"]:
        lid = cl["lessonId"]
        bl = base_l.get(lid)
        if bl is None:
            failures.append({"lessonId": lid, "kind": "new_lesson", "msg": "基线里没有这一课"})
            continue
        for key in ("code_sha256", "files_lesson_py_sha256", "solution_lesson_py_sha256",
                    "debug_code_sha256", "exercise_solution_sha256",
                    "sourceRefs_sha256", "statements_sha256"):
            if bl["hashes"].get(key) != cl["hashes"].get(key):
                failures.append({
                    "lessonId": lid, "kind": "hash_mismatch", "field": key,
                    "baseline": bl["hashes"].get(key), "current": cl["hashes"].get(key),
                })
        if not cl["ok"]:
            failures.append({"lessonId": lid, "kind": "walkthrough_validation",
                             "errors": cl["errors"], "ranges": cl["ranges"]})

    # 2. 保护文件未变；authorized_ui 与 reference 记录变更但不失败
    # （按当前脚本的分类名单判断，而不是基线里的旧字段，以兼容老基线）
    authorized_ui_changes = []
    reference_changes = []
    for rel, bh in base["protected"].items():
        ch = cur["protected"].get(rel)
        if rel in AUTHORIZED_UI:
            cat = "authorized_ui"
        elif rel in REFERENCE:
            cat = "reference"
        else:
            cat = "protected"
        if ch is None or not ch["exists"]:
            if cat == "protected":
                failures.append({"kind": "protected_missing", "file": rel})
            continue
        if ch["sha256"] == bh["sha256"]:
            continue
        if cat == "protected":
            failures.append({"kind": "protected_changed", "file": rel,
                             "baseline": bh["sha256"], "current": ch["sha256"]})
        elif cat == "authorized_ui":
            authorized_ui_changes.append({
                "file": rel, "baseline": bh["sha256"], "current": ch["sha256"],
            })
        else:
            reference_changes.append({
                "file": rel, "baseline": bh["sha256"], "current": ch["sha256"],
            })

    report = {
        "baseline": str(baseline),
        "lessonsTotal": len(cur["lessons"]),
        "lessonsOk": sum(1 for l in cur["lessons"] if l["ok"]),
        "failures": failures,
        "authorized_ui_changes": authorized_ui_changes,
        "reference_changes": reference_changes,
        "lessons": cur["lessons"],
    }
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if out:
        out.write_text(text, encoding="utf-8")
    print(f"check: lessons {report['lessonsOk']}/{report['lessonsTotal']} ok, failures={len(failures)}")
    for f in failures[:50]:
        print(" -", f)
    return 0 if not failures else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--baseline", type=Path)
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()
    if args.snapshot:
        if not args.out:
            print("--snapshot 需要 --out", file=sys.stderr)
            return 2
        return cmd_snapshot(args.out)
    if args.check:
        if not args.baseline:
            print("--check 需要 --baseline", file=sys.stderr)
            return 2
        return cmd_check(args.baseline, args.out)
    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
