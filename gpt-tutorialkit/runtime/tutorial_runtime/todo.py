"""课程里的「待你补全」占位。

    x = TODO('用 torch.stack 把每段堆起来')

运行到这里会抛出 TodoNotDone，并带着提示文字；判题器据此告诉你还剩哪个 TODO。
把整行（或整段）替换成你自己的代码即可。
"""

from __future__ import annotations


class TodoNotDone(NotImplementedError):
    """占位尚未补全。"""


def TODO(hint: str = "") -> None:  # noqa: N802 - 刻意大写，像关键字一样醒目
    raise TodoNotDone(f"TODO 还没完成：{hint}" if hint else "TODO 还没完成")
