"""从带标记的 course/<id>/code.py 派生「初始代码」和「参考答案」。

只写一份完整、可运行的答案代码，在需要学习者自己写的行尾加标记：

    ix = torch.randint(len(data) - block_size, (batch_size,))  # @TODO torch.randint(上限, (batch_size,))
        → 初始代码：ix = TODO('torch.randint(上限, (batch_size,))')
    for _ in range(n):  # @TODO! 写出整个循环
        → 初始代码：TODO('写出整个循环')（强制整行替换，不保留赋值左侧）
    x = x + 1  # @DROP
        → 初始代码里删掉这一行（多行代码块只在第一行放 TODO，其余行 DROP）

参考答案 = 去掉所有标记的原代码。两份都由构建脚本生成，不手工维护。
"""
from __future__ import annotations

import re

_MARK = re.compile(r"\s*#\s*@(TODO!|TODO\b|DROP\b)\s*(.*)$")
_ASSIGN = re.compile(r"^(\s*)([A-Za-z_][\w\.]*(?:\s*,\s*[A-Za-z_][\w\.]*)*)\s*=(?!=)")


def derive(src: str) -> tuple[str, str]:
    starter, solution = [], []
    for line in src.splitlines():
        m = _MARK.search(line)
        if not m:
            starter.append(line)
            solution.append(line)
            continue
        code = line[: m.start()].rstrip()
        kind, hint = m.group(1), m.group(2).strip()
        solution.append(code)
        if kind == "DROP":
            continue
        indent = re.match(r"\s*", code).group(0)
        call = f"TODO({hint!r})"
        a = _ASSIGN.match(code) if kind == "TODO" else None
        starter.append(f"{a.group(1)}{a.group(2)} = {call}" if a else f"{indent}{call}")
    return "\n".join(starter) + "\n", "\n".join(solution) + "\n"
