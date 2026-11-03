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

import hashlib
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from coursecode import derive, marked_lines
from tensorfig import render as render_tensors
from tracefig import trace_html

ROOT = Path(__file__).resolve().parent.parent
COURSE = ROOT / "course"
ASTRO = ROOT / "astro" / "src" / "content" / "tutorial"
NAV_ORDER_FILE = ROOT / "astro" / "src" / "nav-order.json"
ORIGINALS = ROOT / "runtime" / "tutorial_runtime" / "_originals"
TRACES = ROOT / "astro" / "public" / "traces"  # 「看答案」时右侧的执行图解 <课 id>.html，前端按需 fetch

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


def build_traces(lessons) -> None:
    """为每课执行一遍参考答案并画图（tracefig.py）。按内容哈希缓存，答案和运行时没变就不重跑。"""
    deps = [Path(__file__).parent / n for n in ("tracefig.py", "tensorfig.py", "coursecode.py")]
    deps += sorted(p for p in (ROOT / "runtime").rglob("*") if p.is_file() and "__pycache__" not in p.parts)
    base = hashlib.sha256(b"".join(p.read_bytes() for p in deps)).hexdigest()

    jobs = {}
    for d, _, _ in lessons:
        src = (d / "code.py").read_text(encoding="utf-8")
        solution, lines = derive(src)[1], marked_lines(src)
        key = hashlib.sha256(f"{base}\n{lines}\n{solution}".encode()).hexdigest()[:16]
        out = TRACES / f"{d.name}.html"
        if out.is_file() and out.read_text(encoding="utf-8").startswith(f"<!-- trace {key} -->"):
            continue
        jobs[d.name] = (solution, lines, key, out)

    def run(item):
        name, (solution, lines, key, out) = item
        try:
            body = trace_html(solution, lines)
        except Exception as e:  # 图解失败不挡住构建，旧文件删掉以免显示过时的图
            out.unlink(missing_ok=True)
            return f"  {name}: 执行图解失败：{e}"
        out.write_text(f"<!-- trace {key} -->\n{body}", encoding="utf-8")
        return f"  {name}: 已更新执行图解"

    TRACES.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        for msg in pool.map(run, sorted(jobs.items())):
            print(msg)
    keep = {f"{d.name}.html" for d, _, _ in lessons}
    for p in TRACES.glob("*.html"):
        if p.name not in keep:
            p.unlink()


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
        files[ldir / "content.md"] = f"---\ntype: lesson\ntitle: {yaml_str(meta['title'])}\n---\n\n{cjk_bold(render_tensors(body, d.name))}"
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

    foundation = COURSE / "matrices.md"
    foundation_page = ROOT / "astro" / "src" / "pages" / "matrices.md"
    foundation_body = cjk_bold(render_tensors(foundation.read_text(encoding="utf-8"), "matrices"))
    foundation_page.write_text('---\nlayout: ../layouts/Foundation.astro\n---\n\n' + foundation_body, encoding="utf-8")
    sync(files)
    if "--no-trace" not in sys.argv:
        build_traces(lessons)
    NAV_ORDER_FILE.write_text(json.dumps({
        "modules": [{"id": k, "title": v[0], "milestone": v[1]} for k, v in MODULES.items()
                    if any(n["module"] == k for n in nav)],
        "lessons": nav,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(nav)} 课 -> {ASTRO.relative_to(ROOT)}；导航 -> {NAV_ORDER_FILE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
