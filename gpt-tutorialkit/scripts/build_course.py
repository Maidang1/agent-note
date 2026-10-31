#!/usr/bin/env python3
"""把 course/<id>/ 生成为 Astro 课程内容。

课程源（唯一需要手写的地方）：
  course/<NN-slug>/lesson.md    frontmatter(title/module/refs/goal) + 讲解正文
  course/<NN-slug>/code.py      完整答案 + 行尾 @TODO/@DROP 标记（见 coursecode.py），
                                派生出右侧初始代码与参考答案
  course/<NN-slug>/check.py     判题检查项（后端 /check 直接读取，不复制）

生成：
  astro/src/content/tutorial/<module>/<id>/content.md + _files/lesson.py + _solution/lesson.py
  astro/src/nav-order.json      导航顺序、模块、原版行号映射（侧栏 / 源码地图 / 课页共用）
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from coursecode import derive

ROOT = Path(__file__).resolve().parent.parent
COURSE = ROOT / "course"
ASTRO = ROOT / "astro" / "src" / "content" / "tutorial"
NAV_ORDER_FILE = ROOT / "astro" / "src" / "nav-order.json"
ORIGINALS = ROOT / "runtime" / "tutorial_runtime" / "_originals"

# 模块顺序即学习路径；每个模块结束时都有一个能跑起来的里程碑。
MODULES = {
    "m1-data": ("把文字变成训练数据", "你写的 get_batch 和原版逐元素相同"),
    "m2-bigram": ("Bigram：最简单的语言模型", "一个会胡乱续写的模型"),
    "m3-train": ("训练循环", "看着 loss 往下掉，生成开始像英文"),
    "m4-attention": ("自注意力与 Transformer Block", "亲手拼出一个 Block"),
    "m5-gpt": ("组装 GPT", "完整的 GPTLanguageModel"),
    "m6-train-gpt": ("训练你的 GPT", "在本机 CPU 上训练并生成"),
    "m7-final": ("结业：闭卷复现 gpt.py", "从骨架写出整份 gpt.py"),
}

REF_RE = re.compile(r"^(bigram\.py|gpt\.py):(\d+)-(\d+)$")


def parse_lesson_md(path: Path) -> tuple[dict, str]:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        raise ValueError(f"{path}: 缺少 frontmatter")
    meta: dict = {}
    for line in m.group(1).splitlines():
        if not line.strip():
            continue
        key, _, value = line.partition(":")
        meta[key.strip()] = value.strip()
    for key in ("title", "module", "goal"):
        if not meta.get(key):
            raise ValueError(f"{path}: frontmatter 缺少 {key}")
    if meta["module"] not in MODULES:
        raise ValueError(f"{path}: 未知模块 {meta['module']}")
    refs = []
    for raw in filter(None, (r.strip() for r in meta.get("refs", "").split(","))):
        rm = REF_RE.match(raw)
        if not rm:
            raise ValueError(f"{path}: refs 格式应为 gpt.py:40-48，得到 {raw!r}")
        file, start, end = rm.group(1), int(rm.group(2)), int(rm.group(3))
        n_lines = len((ORIGINALS / file).read_text(encoding="utf-8").splitlines())
        if not 1 <= start <= end <= n_lines:
            raise ValueError(f"{path}: {raw} 超出 {file} 的 {n_lines} 行")
        refs.append({"file": file, "start": start, "end": end})
    meta["refs"] = refs
    return meta, m.group(2).lstrip("\n")


_FENCE = re.compile(r"^(```|~~~)")
_CODE_SPAN = re.compile(r"`[^`\n]*`")
_BOLD = re.compile(r"\*\*(?=\S)(.+?)(?<=\S)\*\*")


def cjk_bold(body: str) -> str:
    """把 **粗体** 转成 <strong>，避开代码块和行内代码。

    CommonMark 规定收尾的 ** 若前面是标点、后面紧跟文字就不算闭合，
    中文里「**……。**接着写」「**张量（tensor）**是」这类写法因此会原样露出星号。
    """
    out, in_fence = [], False
    for line in body.split("\n"):
        if _FENCE.match(line.lstrip()):
            in_fence = not in_fence
        if in_fence or _FENCE.match(line.lstrip()):
            out.append(line)
            continue
        spans: list[str] = []
        masked = _CODE_SPAN.sub(lambda m: spans.append(m.group(0)) or f"\0{len(spans) - 1}\0", line)
        masked = _BOLD.sub(r"<strong>\1</strong>", masked)
        out.append(re.sub(r"\0(\d+)\0", lambda m: spans[int(m.group(1))], masked))
    return "\n".join(out)


def yaml_str(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)  # JSON 字符串也是合法 YAML 标量


def sync(files: dict[Path, str]) -> None:
    """让 ASTRO 目录恰好包含 files：内容没变的不碰，多余的文件和空目录删掉。"""
    for path, content in files.items():
        if not path.is_file() or path.read_text(encoding="utf-8") != content:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
    for path in sorted(ASTRO.rglob("*"), key=lambda q: len(q.parts), reverse=True):
        if path.is_file() and path not in files:
            path.unlink()
        elif path.is_dir() and not any(path.iterdir()):
            path.rmdir()


def main() -> int:
    lessons = []
    for d in sorted(p for p in COURSE.iterdir() if p.is_dir() and re.match(r"^\d{2}-", p.name)):
        for name in ("lesson.md", "code.py", "check.py"):
            if not (d / name).is_file():
                raise SystemExit(f"{d.name}: 缺少 {name}")
        meta, body = parse_lesson_md(d / "lesson.md")
        lessons.append((d, meta, body))

    order_seen = [list(MODULES).index(m["module"]) for _, m, _ in lessons]
    if order_seen != sorted(order_seen):
        raise SystemExit("课程编号顺序和模块顺序不一致：同一模块的课要连续，且按 MODULES 顺序排列")

    # 先在内存里算出全部输出，再增量同步：dev server 开着时整目录删掉重建会让 TutorialKit 的文件监听崩掉。
    files: dict[Path, str] = {ASTRO / "meta.md": "---\ntype: tutorial\n---\n"}
    nav = []
    for i, (d, meta, body) in enumerate(lessons, start=1):
        module = meta["module"]
        files[ASTRO / module / "meta.md"] = f"---\ntype: part\ntitle: {yaml_str(MODULES[module][0])}\n---\n"
        ldir = ASTRO / module / d.name
        files[ldir / "content.md"] = f"---\ntype: lesson\ntitle: {yaml_str(meta['title'])}\n---\n\n{cjk_bold(body)}"
        starter, solution = derive((d / "code.py").read_text(encoding="utf-8"))
        files[ldir / "_files" / "lesson.py"] = starter
        files[ldir / "_solution" / "lesson.py"] = solution
        nav.append({
            "order": i,
            "id": d.name,
            "slug": f"{module}/{d.name}",
            "title": meta["title"],
            "goal": meta["goal"],
            "module": module,
            "refs": meta["refs"],
        })

    sync(files)
    NAV_ORDER_FILE.write_text(json.dumps({
        "modules": [{"id": k, "title": v[0], "milestone": v[1]} for k, v in MODULES.items()
                    if any(n["module"] == k for n in nav)],
        "lessons": nav,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(nav)} 课 -> {ASTRO.relative_to(ROOT)}；导航 -> {NAV_ORDER_FILE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
