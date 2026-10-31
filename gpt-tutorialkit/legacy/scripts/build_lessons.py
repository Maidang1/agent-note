#!/usr/bin/env python3
"""把课程 JSON 汇合为真实 TutorialKit lesson 目录结构。

输出到 astro/src/content/tutorial/：
  meta.md                         (type: tutorial)
  <n>-<module>/meta.md            (type: part)
  <n>-<module>/<l>-<slug>/content.md        讲解正文（左侧）
  <n>-<module>/<l>-<slug>/_files/lesson.py  默认可编辑代码（右侧面板初始值）
  <n>-<module>/<l>-<slug>/_solution/lesson.py  答案代码

参数覆盖在 content.md 里以「教学修改」明确标注，保留原版来源行号链接。
不启动原版长训练；课程代码一律经 tutorial_runtime.load_original。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASTRO = ROOT / "astro" / "src" / "content" / "tutorial"
NAV_ORDER_FILE = ROOT / "astro" / "src" / "nav-order.json"

# 课程 canonical 内联在工程内（scripts/lesson_json，32 课）。
# 作者 session artifacts 绝对路径仅作过期时的可选回退，默认不依赖。
SOURCES = [ROOT / "scripts" / "lesson_json"]


def collect() -> list[dict]:
    seen, out = set(), []
    for d in SOURCES:
        if not d.exists():
            continue
        for p in sorted(d.glob("*.json")):
            if p.name == "run-records.json" or p.name.startswith("."):
                continue
            if p.stem in seen:
                continue
            seen.add(p.stem)
            out.append(json.loads(p.read_text(encoding="utf-8")))
    out.sort(key=lambda c: int(c.get("order", c.get("id", "0"))))
    return out


def slugify(s: str) -> str:
    s = re.sub(r"[^\w一-龥]+", "-", s.strip()).strip("-")
    return s or "lesson"


def short_link(file: str, start: int, end: int, url: str) -> str:
    """简洁链接文本，避免长 URL 裸文本撑破布局。"""
    label = f"{file} L{start}–{end}"
    return f"[{label}]({url})"


def _validate_walkthrough(c: dict) -> None:
    """严格校验 canonical walkthrough，不做任何静默修正。

    行号以 JSON 的 code.splitlines() 为准（1-based）。硬性要求：
      - start/end 必须是整数（bool 不算）；
      - 1 <= start <= end <= len(code.splitlines())；
      - 分段不得重叠；
      - 必须覆盖全部「非空代码行」（空行不是代码行，可被跳过，但任何非空行
        漏讲都算缺陷）。
    任一条不满足都抛出带 lessonId 与具体范围的 ValueError，绝不把无效行号
    夹成合法后继续渲染。
    """
    wt = c.get("walkthrough")
    if not wt:
        return  # 该课批次尚未提供 walkthrough：走兜底说明，不伪造分段
    raw = (c.get("code") or "").splitlines()
    n = len(raw)
    lid = c.get("id", "?")
    nonempty = {i + 1 for i, line in enumerate(raw) if line.strip() != ""}
    covered: set[int] = set()
    prev_end = 0
    for i, seg in enumerate(wt):
        s, e = seg.get("start"), seg.get("end")
        if isinstance(s, bool) or isinstance(e, bool) or not isinstance(s, int) or not isinstance(e, int):
            raise ValueError(
                f"lesson {lid} walkthrough#{i} 行号必须是整数，"
                f"得到 start={s!r} end={e!r}"
            )
        if not (1 <= s <= e <= n):
            raise ValueError(
                f"lesson {lid} walkthrough#{i} 行号越界：{s}-{e}"
                f"（默认代码共 {n} 行，需 1<=start<=end<={n}）"
            )
        if s <= prev_end:
            raise ValueError(
                f"lesson {lid} walkthrough#{i} 与上一段重叠："
                f"上一段止于 {prev_end}，本段从 {s} 开始（不得重叠）"
            )
        covered.update(range(s, e + 1))
        prev_end = e
    missing = sorted(nonempty - covered)
    if missing:
        raise ValueError(
            f"lesson {lid} walkthrough 未覆盖非空代码行：{missing}"
            f"（空行可跳过，但每个非空行都必须落在某一段内）"
        )


def build_content(c: dict) -> str:
    """左侧讲解正文。

    唯一对照对象是右侧默认 lesson.py（即 JSON 的 code）：
      标题目标 → 整体直觉(canonical explanation) → 按执行顺序的 walkthrough 分段
      （行号=默认代码实际行号）→ 可改输入/真实输出 → 观察点/练习/debug/术语；
      原版 sourceRefs 与 modifications 只收进末尾折叠的「资料来源/实验说明」。
    不贴任何左侧代码围栏、不展示原版源码或原版行号逐句表。
    """
    ncode = len((c.get("code") or "").splitlines())
    parts: list[str] = []

    # 标题与学习目标
    parts.append(f"## {c['title']}\n")
    parts.append(f"> 学习目标：{c.get('goal','')}\n")

    # 整体直觉 / 流程（canonical explanation）
    parts.append("### 整体直觉\n")
    for para in c.get("explanation") or []:
        parts.append(para.strip() + "\n")

    # 按代码执行顺序的分段讲解（行号=右侧默认 lesson.py）
    parts.append("### 逐段对照右侧代码（按执行顺序）\n")
    parts.append(
        "> 下面行号以右侧**默认 lesson.py** 为准。"
        "增删代码或切换答案/debug 后，可能不再对应；"
        "要跟随这份讲解，请切回默认并重置，再按标出的行号阅读。\n"
    )
    wt = c.get("walkthrough")
    if not wt:
        raise ValueError(
            f"lesson {c.get('id','?')} 缺少 walkthrough 分段讲解（每课均须提供，"
            "不提供用户可见兜底）"
        )
    _validate_walkthrough(c)  # 严格校验：无效立即抛错，不伪造合法行号
    for seg in wt:
        s, e = int(seg["start"]), int(seg["end"])
        title = (seg.get("title") or "").strip()
        head = f"#### 第{s}–{e}行" + (f" · {title}" if title else "")
        parts.append(head + "\n")
        parts.append((seg.get("explanation") or "").strip() + "\n")

    # 可改输入与真实输出
    parts.append("### 可改输入与真实输出\n")
    if c.get("input"):
        parts.append(f"- 可改输入（右侧变量/行）：{c['input']}\n")
    if c.get("expected"):
        parts.append(f"- 真实输出含义（本机真实运行，非预录假输出）：{c['expected']}\n")
    parts.append("")

    # 可观察验证点
    cps = c.get("checkpoints") or []
    if cps:
        parts.append("### 可观察验证点\n")
        for x in cps:
            parts.append(f"- {x}\n")
        parts.append("")

    # 练习
    ex = c.get("exercise") or {}
    if ex:
        parts.append("### 练习\n")
        if ex.get("instruction"):
            parts.append(f"- 任务：{ex['instruction']}\n")
        if ex.get("hint"):
            parts.append(f"- 提示：{ex['hint']}\n")
        if ex.get("solution"):
            parts.append(f"- 参考改法：{ex['solution']}\n")
        parts.append("")

    # 故意报错实验：不在正文贴 debug 代码围栏（debug.code 数据保留在 JSON/右侧 debug 模式）
    dbg = c.get("debug") or {}
    if dbg:
        parts.append("### 故意报错实验（右侧切到 debug 再运行，观察异常后修复）\n")
        if dbg.get("instruction"):
            parts.append(f"- 目的：{dbg['instruction']}\n")
        if dbg.get("expectedError"):
            parts.append(f"- 预期错误：`{dbg['expectedError']}`\n")
        if dbg.get("fix"):
            parts.append(f"- 修复：{dbg['fix']}\n")
        parts.append("")

    # 本步术语
    gl = c.get("glossary") or []
    if gl:
        parts.append("### 本步术语\n")
        for g in gl:
            parts.append(f"- **{g.get('term','')}**：{g.get('explanation','')}\n")
        parts.append("")

    # 末尾折叠：原版链接（不贴原版源码）+ 教学实验说明
    refs = c.get("sourceRefs") or []
    mods = c.get("modifications") or []
    if refs or mods:
        parts.append(
            '<details>\n<summary>资料来源与教学实验说明（原版链接 / 参数覆盖，只读）</summary>\n'
        )
        if refs:
            parts.append("\n**原版位置（karpathy/ng-video-lecture @ 固定提交 52201428）：**\n")
            for r in refs:
                parts.append(f"- {short_link(r['file'], r['start'], r['end'], r['url'])}\n")
        if mods:
            parts.append("\n**教学修改对照（参数覆盖，原版完整保留）：**\n")
            for m in mods:
                parts.append(
                    f"- 原版：{m.get('original','')}\n"
                    f"  - 教学：{m.get('teaching','')}\n"
                    f"  - 理由：{m.get('reason','')}\n"
                )
        parts.append("\n</details>\n")

    return "\n".join(parts)


def main() -> int:
    lessons = collect()
    # 按 module 分组，保持出现顺序
    modules: dict[str, list[dict]] = {}
    for c in lessons:
        modules.setdefault(c.get("module", "其他"), []).append(c)

    if ASTRO.exists():
        import shutil
        shutil.rmtree(ASTRO)
    ASTRO.mkdir(parents=True)

    (ASTRO / "meta.md").write_text(
        "---\ntype: tutorial\n---\n# 从零手写 GPT（Karpathy 课程）本机 PyTorch 实验\n",
        encoding="utf-8",
    )

    nav_entries: list[dict] = []
    for pi, (mod, items) in enumerate(modules.items(), start=1):
        pdir = ASTRO / f"{pi}-{slugify(mod)}"
        pdir.mkdir(parents=True)
        (pdir / "meta.md").write_text(
            f"---\ntype: part\ntitle: {mod}\n---\n", encoding="utf-8"
        )
        for li, c in enumerate(items, start=1):
            slug_dir = f"{li}-{slugify(c['title'])}"
            ldir = pdir / slug_dir
            (ldir / "_files").mkdir(parents=True)
            (ldir / "_solution").mkdir(parents=True)
            (ldir / "content.md").write_text(
                "---\ntype: lesson\ntitle: " + c["title"] + "\ncustom:\n  lessonId: \"" + c["id"] + "\"\n---\n\n"
                + build_content(c),
                encoding="utf-8",
            )
            (ldir / "_files" / "lesson.py").write_text(c["code"], encoding="utf-8")
            sol = c.get("exercise", {}).get("solution")
            (ldir / "_solution" / "lesson.py").write_text(
                c["code"] + ("\n\n# 参考答案思路：" + sol if sol else ""),
                encoding="utf-8",
            )
            # 全局导航顺序：严格按 JSON.order（lessons 已排序），与路径字符串排序无关
            nav_entries.append({
                "order": int(c.get("order", c.get("id", "0"))),
                "slug": f"{pi}-{slugify(mod)}/{slug_dir}",
                "title": c["title"],
            })
        print(f"part {pi} {mod}: {len(items)} lessons")

    nav_entries.sort(key=lambda e: e["order"])
    NAV_ORDER_FILE.write_text(
        __import__("json").dumps(nav_entries, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"合计 {len(lessons)} lessons -> {ASTRO}")
    print(f"导航顺序({len(nav_entries)}) -> {NAV_ORDER_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
