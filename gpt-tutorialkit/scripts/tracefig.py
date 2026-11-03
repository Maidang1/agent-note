"""「看答案」时右侧的执行图解：真的跑一遍参考答案，按执行顺序画出整段代码的运行过程。

构建时由 build_course.py 调用 trace_html()：在独立子进程、独立临时目录里执行答案（和后端一样，
PYTHONPATH 指向 runtime/），用 sys.settrace 跟踪文件里的每一行：

- 按「第一次执行」的先后排列；调用进函数里的行向右缩进一层（比如 model(xb) 下面接着 forward 的几行）。
- 每行画出：执行前读到的张量（「读入」）、执行后赋值的变量、if / while 的条件、这一行 print 出的内容。
- 循环里的行只画第一次，另外注明一共执行了几次。
- 学习者要写的行（@TODO / @DROP）单独标出来。

    python scripts/tracefig.py <solution.py> <行号,行号,...> <输出.html>
"""
from __future__ import annotations

import ast
import html
import io
import os
import reprlib
import subprocess
import sys
import tempfile
import types
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = ROOT / "runtime"
TIMEOUT_SEC = 300

# 右侧面板比课文窄，格子图画得更小
LIMITS = {"rows": 6, "panels": 2, "float_cols": 8, "int_cols": 12}
MAX_OUTPUT = 1200  # 每行 print 的内容最多显示多少字

_repr = reprlib.Repr()
_repr.maxstring, _repr.maxother, _repr.maxlist, _repr.maxtuple, _repr.maxdict = 80, 80, 12, 12, 6
_repr.maxlevel = 2

# 不画的语句：定义、导入这类「准备工作」
_SKIP = (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef,
         ast.Pass, ast.Global, ast.Nonlocal)


def trace_html(solution: str, lines: list[int]) -> str:
    """在子进程里执行答案并返回图解 HTML；失败时抛 RuntimeError（带子进程的报错尾部）。"""
    with tempfile.TemporaryDirectory(prefix="tktrace_") as tmp:
        sol, out = Path(tmp) / "lesson.py", Path(tmp) / "trace.html"
        sol.write_text(solution, encoding="utf-8")
        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "PYTHONPATH": os.pathsep.join([str(RUNTIME), str(Path(__file__).parent)]),
            "PYTHONDONTWRITEBYTECODE": "1",
            "MPLBACKEND": "Agg",
        }
        proc = subprocess.run(
            [sys.executable, __file__, str(sol), ",".join(map(str, lines)), str(out)],
            cwd=tmp, env=env, capture_output=True, text=True, timeout=TIMEOUT_SEC,
        )
        if proc.returncode != 0 or not out.is_file():
            raise RuntimeError(proc.stderr.strip()[-1500:] or f"退出码 {proc.returncode}")
        return out.read_text(encoding="utf-8")


# ---------------- 以下在子进程里运行 ----------------

class _Raw(str):
    """按原样显示的文字（不加引号）。"""
    def __repr__(self) -> str:
        return str(self)


def _freeze(v):
    """记录当下的值：张量拷贝一份（之后可能被原地改写），其他对象转成简短文字。"""
    import torch
    if isinstance(v, torch.Tensor):
        return v.detach().clone()
    if isinstance(v, (bool, int, float, torch.Size)) or v is None:
        return v
    if isinstance(v, torch.nn.Module):
        lines = repr(v).splitlines()
        return _Raw(lines[0] if len(lines) == 1 else f"{type(v).__name__}(…)")
    if isinstance(v, torch.optim.Optimizer):
        return _Raw(f"{type(v).__name__}(…)")
    if isinstance(v, types.ModuleType):
        return _Raw(f"<模块 {v.__name__}>")
    if isinstance(v, type):
        return _Raw(f"<类 {v.__name__}>")
    if callable(v):
        return _Raw(f"<函数 {getattr(v, '__name__', type(v).__name__)}>")
    if isinstance(v, dict) and not all(isinstance(x, (int, float, str, bool)) for x in v.values()):
        # 像 load_original 返回的命名空间：只列名字
        keys = [k for k in v if not str(k).startswith("__")]
        shown = ", ".join(map(str, keys[:12])) + (", …" if len(keys) > 12 else "")
        return _Raw(f"{{{shown}}}（共 {len(keys)} 项）")
    return _Raw(_repr.repr(v))


def _statements(tree) -> tuple[dict[int, ast.stmt], dict[int, int]]:
    """行号 → 从这一行开始的语句；物理行 → 它所属语句的起始行（多行语句的续行、装饰器都归到语句上）。"""
    stmts: dict[int, ast.stmt] = {}
    owner: dict[int, int] = {}
    for node in ast.walk(tree):  # 广度优先：内层语句后处理，覆盖外层
        if not isinstance(node, ast.stmt):
            continue
        stmts[node.lineno] = node
        body = getattr(node, "body", None)
        first = min([d.lineno for d in getattr(node, "decorator_list", [])] + [node.lineno])
        last = body[0].lineno - 1 if isinstance(body, list) and body else node.end_lineno
        for ln in range(first, max(last, node.lineno) + 1):
            owner[ln] = node.lineno
    return stmts, owner


def _header(stmt, src_lines: list[str]) -> str:
    """要显示的代码：简单语句显示全部行，复合语句（for / if / with）只显示头部。"""
    body = getattr(stmt, "body", None)
    end = body[0].lineno - 1 if isinstance(body, list) and body else stmt.end_lineno
    chunk = src_lines[stmt.lineno - 1: max(end, stmt.lineno)]
    indent = min(len(l) - len(l.lstrip()) for l in chunk if l.strip())
    return "\n".join(l[indent:].rstrip() for l in chunk)


def _reads(stmt) -> list[str]:
    """这一行读到的变量 / 属性（如 idx、self.tril）。执行前取值，只保留其中的张量。"""
    if isinstance(stmt, (ast.Assign, ast.AnnAssign)):
        roots = [stmt.value]
    elif isinstance(stmt, ast.AugAssign):
        roots = [stmt.target, stmt.value]
    elif isinstance(stmt, ast.For):
        roots = [stmt.iter]
    elif isinstance(stmt, (ast.If, ast.While)):
        roots = [stmt.test]
    elif isinstance(stmt, (ast.Expr, ast.Return)):
        roots = [stmt.value]
    else:
        return []
    out: list[str] = []

    def walk(node):
        if isinstance(node, (ast.Name, ast.Attribute)) and not isinstance(node.ctx, ast.Store):
            expr = ast.unparse(node)
            if expr not in out:
                out.append(expr)
            if isinstance(node, ast.Name):
                return
        for child in ast.iter_child_nodes(node):
            walk(child)
    for r in roots:
        if r is not None:
            walk(r)
    return out


def _targets(stmt) -> list[str]:
    """一行代码跑完之后值得看的表达式：赋值目标、for 循环变量、register_buffer 登记的名字。"""
    out: list[str] = []

    def walk(t):
        if isinstance(t, (ast.Tuple, ast.List)):
            for e in t.elts:
                walk(e)
        elif isinstance(t, (ast.Subscript, ast.Starred)):
            walk(t.value)
        elif isinstance(t, (ast.Name, ast.Attribute)):
            expr = ast.unparse(t)
            if expr != "_" and expr not in out:
                out.append(expr)

    if isinstance(stmt, ast.Assign):
        for t in stmt.targets:
            walk(t)
    elif isinstance(stmt, (ast.AugAssign, ast.AnnAssign, ast.For)):
        walk(stmt.target)
    elif isinstance(stmt, ast.With):
        for item in stmt.items:
            if item.optional_vars is not None:
                walk(item.optional_vars)
    elif isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
        f, args = stmt.value.func, stmt.value.args
        if (isinstance(f, ast.Attribute) and f.attr == "register_buffer" and args
                and isinstance(args[0], ast.Constant) and isinstance(args[0].value, str)):
            out.append(f"{ast.unparse(f.value)}.{args[0].value}")
    return out


def _skip(stmt) -> bool:
    if isinstance(stmt, _SKIP):
        return True
    # 文档字符串
    return isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant) and isinstance(stmt.value.value, str)


def _run(sol_path: str, lines: list[int], out_path: str) -> None:
    import torch
    import tensorfig

    src = Path(sol_path).read_text(encoding="utf-8")
    src_lines = src.splitlines()
    fname = str(Path(sol_path).resolve())
    mine = set(lines)
    stmts, owner = _statements(ast.parse(src))

    order: list[int] = []         # 按第一次开始执行的先后
    rec: dict[int, dict | None] = {}  # 行 → 第一次执行时记下的东西；None 表示这一行不画
    hits: Counter[int] = Counter()
    last: dict[int, int] = {}     # 帧 → 正在执行的语句
    out = io.StringIO()
    claimed = [0]                 # out 里已经分给某一行的位置

    def ours(frame) -> bool:
        name = frame.f_code.co_name
        return frame.f_code.co_filename == fname and (not name.startswith("<") or name == "<module>")

    def take(frame, exprs, tensors_only):
        vals = []
        for expr in exprs:
            try:
                v = eval(expr, frame.f_globals, frame.f_locals)
            except Exception:
                continue
            if tensors_only and not isinstance(v, torch.Tensor):
                continue
            vals.append((expr, _freeze(v)))
        return vals

    def start(frame, line):
        if line in rec:
            return
        stmt = stmts.get(line)
        if stmt is None or _skip(stmt):
            rec[line] = None
            return
        depth, f = 0, frame.f_back
        while f is not None:
            depth += ours(f)
            f = f.f_back
        r = {"depth": depth, "inputs": take(frame, _reads(stmt), True), "cond": None}
        if isinstance(stmt, (ast.If, ast.While)):
            try:
                r["cond"] = bool(eval(compile(ast.Expression(stmt.test), fname, "eval"),
                                      frame.f_globals, frame.f_locals))
            except Exception:
                pass
        rec[line] = r
        order.append(line)

    def finish(frame, line):
        hits[line] += 1
        pos = out.tell()
        text = out.getvalue()[claimed[0]:pos] if pos > claimed[0] else ""
        claimed[0] = pos
        r = rec.get(line)
        if not r or "values" in r:
            return
        r["values"] = take(frame, _targets(stmts[line]), False)
        r["out"] = text

    def local(frame, event, arg):
        if event == "line":
            line = owner.get(frame.f_lineno, frame.f_lineno)
            prev = last.get(id(frame))
            if prev == line:
                return local  # 多行语句的续行
            if prev is not None:
                finish(frame, prev)
            last[id(frame)] = line
            start(frame, line)
        elif event == "return":
            prev = last.pop(id(frame), None)
            if prev is not None:
                finish(frame, prev)
        return local

    def glob(frame, event, arg):
        return local if ours(frame) else None  # lambda、生成器表达式等内部帧不单独看

    code = compile(src, fname, "exec")
    stdout = sys.stdout
    sys.stdout = out
    sys.settrace(glob)
    try:
        exec(code, {"__name__": "__main__", "__file__": fname})
    finally:
        sys.settrace(None)
        sys.stdout = stdout

    _write(out_path, order, rec, hits, mine, stmts, src_lines, tensorfig)


def _write(out_path, order, rec, hits, mine, stmts, src_lines, tensorfig) -> None:
    import torch

    def same(a, b):
        return (isinstance(a, torch.Tensor) and isinstance(b, torch.Tensor)
                and a.shape == b.shape and a.dtype == b.dtype and torch.equal(a, b))

    fig = tensorfig.Figure("", "", LIMITS)
    shown: dict[str, object] = {}  # 上面刚画过的值；读入的张量和它一样就不再重画
    steps = []
    for line in order:
        r = rec[line]
        notes = []
        if line in mine:
            notes.append("✎ 你要写的")
        if hits[line] > 1:
            notes.append(f"执行了 {hits[line]} 次，图里是第 1 次")
        if r["cond"] is not None:
            notes.append(f"条件为 {r['cond']}")
        vals, repeated = [], []
        for e, v in r["inputs"]:
            if e in shown and same(shown[e], v):
                repeated.append(e)
            else:
                vals.append((f"读入 {e}", e, v, False))
        if repeated:
            notes.append(f"读入的 {'、'.join(repeated)} 和上面一样")
        vals += [(e, e, v, False) for e, v in r.get("values", [])]
        shown.update((e, v) for _, e, v, _ in vals)

        body = "".join(fig._value(*v) for v in vals)
        printed = r.get("out", "")
        if len(printed) > MAX_OUTPUT:
            printed = printed[:MAX_OUTPUT] + "…\n"
        cls = "tfig-step tfig-mine" if line in mine else "tfig-step"
        style = f' style="--depth:{r["depth"]}"' if r["depth"] else ""
        steps.append(
            f'<li class="{cls}"{style}><div class="tfig-head"><span class="tfig-num">{line}</span>'
            f'<pre class="tfig-code"><code>{html.escape(_header(stmts[line], src_lines))}</code></pre></div>'
            + (f'<p class="tfig-cap">{html.escape(" · ".join(notes))}</p>' if notes else "")
            + (f'<div class="tfig-vals">{body}</div>' if body else "")
            + (f'<pre class="tfig-out">{html.escape(printed.rstrip())}</pre>' if printed.strip() else "")
            + "</li>"
        )
    title = ("整段代码的运行过程（真实数据）：按执行顺序排列，每行只画第一次执行；"
             "向右缩进的是被调用的函数里的行；「读入」是这一行执行前用到的张量，其余是执行后的结果")
    Path(out_path).write_text(
        f'<figure class="tfig tfig-trace"><figcaption class="tfig-title">{html.escape(title)}</figcaption>'
        f'<ol class="tfig-steps">{"".join(steps)}</ol></figure>',
        encoding="utf-8",
    )


if __name__ == "__main__":
    _run(sys.argv[1], [int(x) for x in sys.argv[2].split(",") if x], sys.argv[3])
