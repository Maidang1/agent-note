"""把 lesson.md 里的 ```tensors 代码块渲染成「每一步张量长什么样」的图解。

写法：块里就是普通的 PyTorch 代码，构建时真的执行一遍（固定种子），所以图上的数字都是真的。

    ```tensors 图解标题（可省略）
    dims('idx', 'B T')                      # 不带 #: 的语句只执行、不显示（准备数据、设置显示方式）
    idx = torch.tensor([[1, 2], [0, 1]])    #: 输入的字符编号
    logits = table(idx)                     #: 每个编号取出表里的一行
    ```

- 行尾带 `#: 说明` 的语句是一个「步骤」：显示代码、说明，以及它赋值的变量。
- 显示方式（下列函数在块里直接可用）：
    dims(name, 'B T C')           各维的名字，形状显示成 (B=2, T=3, C=4)；按维数分别记，同名变量
                                  变形后可以再设一份（如 'B*T C'）；持续生效
    labels(name, rows=, cols=)    行 / 列标签（如字符）；3 维以上可给每个面板一组 rows；持续生效
    as_chars(name, itos)          整数张量的格子里在编号旁标出对应字符；持续生效
    hl(name, S[:, -1, :])         下一步里高亮这些格子（其余变淡）；只对下一步生效
    show('expr', ...)             下一步额外显示这些表达式（语句执行之后的值）
    before('name', ...)           下一步额外显示这些变量在语句执行「之前」的值（hl 只作用在它上面）
    hide(name, ...)               下一步不显示这些赋值目标
- 行尾不带 `#:` 的语句照常执行；裸表达式步骤会在最后显示它的值（→ ...）。
"""
from __future__ import annotations

import ast
import html
import math
import re

FENCE = re.compile(r"^```tensors[ \t]*(.*?)\n(.*?)^```[ \t]*$", re.S | re.M)

# 每张格子图最多画几行 / 几列 / 几块面板，多出的用 … 省略
LIMITS = {"rows": 8, "panels": 4, "float_cols": 10, "int_cols": 16}


class _Slicer:
    def __getitem__(self, key):
        return key


def render(body: str, where: str = "") -> str:
    """替换 body 中所有 ```tensors 块。"""
    def sub(m: re.Match) -> str:
        try:
            return Figure(m.group(1).strip(), m.group(2)).html()
        except Exception as e:  # 构建时直接报出是哪一课哪一行
            raise SystemExit(f"{where}: tensors 图解执行失败：{type(e).__name__}: {e}") from e
    return FENCE.sub(sub, body)


class Figure:
    def __init__(self, title: str, src: str, limits: dict | None = None):
        self.title, self.src = title, src
        self.limits = {**LIMITS, **(limits or {})}
        self.dims: dict[tuple[str, int], list[str]] = {}
        self.labels: dict[str, dict] = {}
        self.chars: dict[str, object] = {}
        self.pending_hl: dict[str, object] = {}
        self.pending_show: list[str] = []
        self.pending_before: list[str] = []
        self.pending_hide: set[str] = set()

    # ---------- 执行 ----------
    def _namespace(self) -> dict:
        import torch
        import torch.nn as nn
        import torch.nn.functional as F
        torch.manual_seed(1337)
        return {
            "torch": torch, "nn": nn, "F": F, "S": _Slicer(),
            "dims": lambda name, spec: self.dims.__setitem__((name, len(spec.split())), spec.split()),
            "labels": lambda name, rows=None, cols=None: self.labels.__setitem__(name, {"rows": rows, "cols": cols}),
            "as_chars": lambda name, itos: self.chars.__setitem__(name, itos),
            "before": lambda *names: self.pending_before.extend(names),
            "hl": lambda name, idx: self.pending_hl.__setitem__(name, idx),
            "show": lambda *exprs: self.pending_show.extend(exprs),
            "hide": lambda *names: self.pending_hide.update(names),
        }

    def html(self) -> str:
        ns = self._namespace()
        lines = self.src.splitlines()
        steps = []
        for stmt in ast.parse(self.src).body:
            chunk = lines[stmt.lineno - 1: stmt.end_lineno]
            last = chunk[-1]
            caption = None
            m = re.search(r"#:\s?(.*)$", last)
            if m:
                caption = m.group(1).strip()
                chunk = chunk[:-1] + [last[: m.start()].rstrip()]
            snap = [(f"{e}（这一步之前）", e, _copy(eval(e, ns))) for e in self.pending_before]
            result = None
            if isinstance(stmt, ast.Expr):
                result = eval(compile(ast.Expression(stmt.value), "<tensors>", "eval"), ns)
            else:
                exec(compile(ast.Module([stmt], []), "<tensors>", "exec"), ns)
            if caption is None:
                continue
            names = [n for n in _targets(stmt) if n not in self.pending_hide]
            # (显示名, 查 dims/labels/hl 用的名字, 值, 是否套用 hl)
            vals = [(label, key, v, True) for label, key, v in snap]
            vals += [(n, n, ns[n], not snap) for n in names]
            vals += [(e, e, eval(e, ns), not snap) for e in self.pending_show]
            if result is not None and not _is_directive(stmt):
                vals.append(("→", "→", result, False))
            steps.append(self._step(len(steps) + 1, "\n".join(chunk), caption, vals))
            self.pending_hl, self.pending_show, self.pending_before, self.pending_hide = {}, [], [], set()
        title = f'<figcaption class="tfig-title">{_inline(self.title)}</figcaption>' if self.title else ""
        return f'<figure class="tfig">{title}<ol class="tfig-steps">{"".join(steps)}</ol></figure>'

    # ---------- 渲染 ----------
    def _step(self, num: int, code: str, caption: str, vals) -> str:
        code_html = f'<pre class="tfig-code"><code>{html.escape(code)}</code></pre>' if code.strip() else ""
        body = "".join(self._value(*v) for v in vals)
        vals_html = f'<div class="tfig-vals">{body}</div>' if body else ""
        return (f'<li class="tfig-step"><div class="tfig-head"><span class="tfig-num">{num}</span>'
                f'<p class="tfig-cap">{_inline(caption)}</p></div>{code_html}'
                f'{vals_html}</li>')

    def _value(self, label: str, name: str, v, use_hl: bool) -> str:
        import torch
        esc = html.escape(label)
        if isinstance(v, torch.nn.Parameter):
            v = v.detach()
        if isinstance(v, torch.Tensor) and v.dim() == 0:
            v = v.item()
        if not isinstance(v, torch.Tensor):
            if isinstance(v, float):
                text = _fmt_float(v, 4)
            elif isinstance(v, torch.Size):
                text = str(tuple(v))
            else:
                text = repr(v)
            sep = " " if name == "→" else " = "
            return f'<div class="tfig-val tfig-scalar"><code>{esc}{sep}{html.escape(text)}</code></div>'

        t = v.detach().cpu()
        dims = self.dims.get((name, t.dim()))
        shape = ", ".join(f"{d}={s}" for d, s in zip(dims, t.shape)) if dims else ", ".join(map(str, t.shape))
        if t.dim() == 1 and not dims:
            shape += ","
        head = f'<div class="tfig-name"><code>{esc}</code><span class="tfig-shape">({shape})</span></div>'

        mask = None
        if use_hl and name in self.pending_hl:
            mask = torch.zeros(t.shape, dtype=torch.bool)
            mask[self.pending_hl[name]] = True

        grid = t.reshape(1, 1, -1) if t.dim() == 1 else t.reshape(-1, *t.shape[-2:]) if t.dim() >= 2 else t
        gmask = None if mask is None else mask.reshape(grid.shape)
        lead = list(t.shape[:-2]) if t.dim() > 2 else []
        is_float = t.is_floating_point()
        finite = t[torch.isfinite(t)] if is_float else t
        scale = float(finite.abs().max()) if is_float and finite.numel() else 0.0
        lab = self.labels.get(name, {})
        itos = self.chars.get(name)

        panels = []
        n = grid.shape[0]
        for p in _pick(n, self.limits["panels"]):
            if p is None:
                panels.append('<div class="tfig-more">…</div>')
                continue
            title = ""
            if lead:
                idx = _unravel(p, lead)
                text = (" ".join(f"{d}={i}" for d, i in zip(dims, idx)) if dims
                        else f"{name}[{', '.join(map(str, idx))}]")
                title = f'<div class="tfig-panel-title">{html.escape(text)}</div>'
            rows = lab.get("rows")
            if rows and len(rows) == n and (isinstance(rows[0], (list, tuple)) or len(rows[0]) > 1):
                rows = rows[p]  # 每个面板一组行标签，如 ['hel', 'ell']
            panel_lab = {"rows": rows, "cols": lab.get("cols")}
            sub = None if gmask is None else gmask[p]
            panels.append(f'<div class="tfig-panel">{title}'
                          f'{self._grid(grid[p], sub, t.dim(), dims, panel_lab, itos, is_float, scale)}</div>')
        return f'<div class="tfig-val">{head}<div class="tfig-panels">{"".join(panels)}</div></div>'

    def _grid(self, g, m, ndim, dims, lab, itos, is_float, scale) -> str:
        R, C = g.shape
        rows = _pick(R, self.limits["rows"])
        cols = _pick(C, self.limits["float_cols" if is_float else "int_cols"])
        row_labels, col_labels = lab.get("rows"), lab.get("cols")
        show_rows = ndim >= 2
        cells = []
        # 列标题
        if show_rows:
            corner = ""
            if dims and len(dims) >= 2:
                corner = f"{dims[-2]}↓ {dims[-1]}→"
            cells.append(f'<span class="tc-corner">{html.escape(corner)}</span>')
        for c in cols:
            text = "…" if c is None else (col_labels[c] if col_labels else str(c))
            cells.append(f'<span class="tc-h">{html.escape(_vis(text))}</span>')
        for r in rows:
            if show_rows:
                text = "⋮" if r is None else (row_labels[r] if row_labels else str(r))
                cells.append(f'<span class="tc-h tc-rh">{html.escape(_vis(text))}</span>')
            for c in cols:
                if r is None or c is None:
                    cells.append('<span class="tc tc-gap">…</span>' if r is not None else '<span class="tc tc-gap">⋮</span>')
                    continue
                x = g[r, c].item()
                cls, style = ["tc"], ""
                if g.dtype == __import__("torch").bool:
                    text = "T" if x else "F"
                    if x:
                        cls.append("tc-on")
                elif is_float:
                    if math.isinf(x):
                        text = "−∞" if x < 0 else "∞"
                        cls.append("tc-inf")
                    else:
                        text = _fmt_float(x)
                        if scale > 0 and x != 0:
                            a = min(abs(x) / scale, 1.0) * 0.55 + 0.06
                            color = "var(--tfig-pos)" if x > 0 else "var(--tfig-neg)"
                            style = f' style="background:color-mix(in srgb, {color} {a * 100:.0f}%, transparent)"'
                else:
                    text = str(x)
                inner = html.escape(text)
                if itos is not None and not is_float:
                    inner = f'{inner}<small>{html.escape(_vis(itos[x]))}</small>'
                    cls.append("tc-char")
                if m is not None:
                    cls.append("tc-hl" if m[r, c] else "tc-dim")
                cells.append(f'<span class="{" ".join(cls)}"{style}>{inner}</span>')
        ncols = len(cols) + (1 if show_rows else 0)
        return f'<div class="tgrid" style="grid-template-columns:repeat({ncols}, auto)">{"".join(cells)}</div>'


def _is_directive(stmt) -> bool:
    v = stmt.value
    return isinstance(v, ast.Call) and isinstance(v.func, ast.Name) and v.func.id in (
        "dims", "labels", "as_chars", "hl", "show", "before", "hide")


def _copy(v):
    import torch
    return v.detach().clone() if isinstance(v, torch.Tensor) else v


def _targets(stmt) -> list[str]:
    out: list[str] = []

    def walk(t):
        if isinstance(t, ast.Name):
            out.append(t.id)
        elif isinstance(t, (ast.Tuple, ast.List)):
            for e in t.elts:
                walk(e)
    if isinstance(stmt, ast.Assign):
        for t in stmt.targets:
            walk(t)
    elif isinstance(stmt, (ast.AugAssign, ast.AnnAssign)):
        walk(stmt.target)
    return [n for n in out if n != "_"]


def _pick(n: int, limit: int) -> list:
    if n <= limit:
        return list(range(n))
    head = max(limit - 2, 1)
    return list(range(head)) + [None, n - 1]


def _unravel(i: int, shape: list[int]) -> list[int]:
    out = []
    for s in reversed(shape):
        out.append(i % s)
        i //= s
    return out[::-1]


def _fmt_float(x: float, digits: int = 2) -> str:
    if abs(x) >= 100:
        return f"{x:.0f}"
    s = f"{x:.{digits}f}"
    return "0" if s in ("0.00", "-0.00", "0.0000", "-0.0000") else s.replace("-", "−")


def _vis(s: str) -> str:
    return {"\n": "⏎", " ": "␣"}.get(s, s)


def _inline(text: str) -> str:
    """说明文字里只支持 `代码` 和 **粗体**。"""
    out = html.escape(text)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", out)
