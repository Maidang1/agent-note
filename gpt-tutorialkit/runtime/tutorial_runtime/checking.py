"""判题用的小工具：每课的 course/<id>/check.py 用它们声明检查项。

    from tutorial_runtime.checking import check, expect, get, ref, same

    @check('get_batch 返回的形状是 (B, T)')
    def _(L):                      # L = 学习者代码执行后的全局命名空间
        xb, yb = get(L, 'get_batch')('train')
        ...

检查项按声明顺序执行；抛出 CheckFailed 表示没通过，消息会原样显示给学习者，
所以消息要写成「哪里不对 + 往哪个方向改」。
"""

from __future__ import annotations

from typing import Any, Callable

from .loader import load_original

_registry: list[tuple[str, Callable[[dict], Any]]] = []


class CheckFailed(AssertionError):
    pass


def check(name: str):
    def deco(fn):
        _registry.append((name, fn))
        return fn
    return deco


def fail(msg: str):
    raise CheckFailed(msg)


def expect(cond: Any, msg: str) -> None:
    if not cond:
        fail(msg)


def get(L: dict, name: str):
    if name not in L:
        fail(f"没找到 `{name}`：代码可能在定义它之前就报错停下了（看第一项），或者它被删掉、改名了。")
    return L[name]


def ref(which: str = "gpt", **overrides) -> dict:
    """一份全新的原版命名空间（和学习者用的是同一套教学覆盖）。"""
    return load_original(which, overrides=overrides)


def seed(n: int = 1337) -> None:
    import torch
    torch.manual_seed(n)


def same(actual, expected, what: str, atol: float = 1e-5) -> None:
    """张量逐元素比较；形状、类型、数值依次报错。"""
    import torch
    if actual is None:
        fail(f"{what} 是 None：是不是忘了 return？")
    if not isinstance(actual, torch.Tensor):
        fail(f"{what} 应该是张量，实际是 {type(actual).__name__}。")
    if tuple(actual.shape) != tuple(expected.shape):
        fail(f"{what} 的形状是 {tuple(actual.shape)}，原版是 {tuple(expected.shape)}。")
    if actual.dtype != expected.dtype:
        fail(f"{what} 的 dtype 是 {actual.dtype}，原版是 {expected.dtype}。")
    if actual.dtype in (torch.long, torch.int, torch.bool):
        if not torch.equal(actual, expected):
            n_bad = int((actual != expected).sum())
            fail(f"{what} 形状对了，但有 {n_bad} 个元素和原版不同。")
        return
    if not torch.allclose(actual, expected, atol=atol, rtol=1e-4):
        diff = (actual - expected).abs().max().item()
        fail(f"{what} 形状对了，但数值和原版不同（最大差 {diff:.3g}）。")


def _same_keys(mine_sd: dict, ref_sd: dict, what: str) -> None:
    missing = sorted(set(ref_sd) - set(mine_sd))
    extra = sorted(set(mine_sd) - set(ref_sd))
    if missing or extra:
        parts = []
        if missing:
            parts.append("缺少 " + ", ".join(missing[:6]))
        if extra:
            parts.append("多出 " + ", ".join(extra[:6]))
        fail(f"{what} 的参数名和原版不一致：{'；'.join(parts)}。属性名要和原版一模一样。")
    for k in ref_sd:
        if tuple(ref_sd[k].shape) != tuple(mine_sd[k].shape):
            fail(f"{what} 的 `{k}` 形状是 {tuple(mine_sd[k].shape)}，原版是 {tuple(ref_sd[k].shape)}。")


def copy_weights(dst, src, what: str) -> None:
    """把原版模块的权重灌进学习者模块；参数名或形状对不上就报出来。"""
    _same_keys(dst.state_dict(), src.state_dict(), what)
    dst.load_state_dict(src.state_dict())


def same_init(make_mine: Callable, make_ref: Callable, what: str, at: int = 1337) -> tuple:
    """同一随机种子下各建一次：参数名、形状、初始值都应和原版完全一致。"""
    import torch
    seed(at)
    theirs = make_ref()
    seed(at)
    mine = make_mine()
    if mine is None:
        fail(f"{what} 没有建出来（得到 None）。")
    s_sd, m_sd = theirs.state_dict(), mine.state_dict()
    _same_keys(m_sd, s_sd, what)
    for k in s_sd:
        if not torch.equal(s_sd[k], m_sd[k]):
            fail(f"{what} 的 `{k}` 形状对了但初始值不同：子模块的创建顺序要和原版一致"
                 f"（随机初始化按创建顺序消耗随机数）。")
    return mine, theirs


def same_forward(mine, theirs, inputs: tuple, what: str, train: bool = False, atol: float = 1e-5):
    """两模块权重相同前提下，同一随机种子跑 forward，比较输出。"""
    mine.train(train)
    theirs.train(train)
    seed(7)
    out_ref = theirs(*inputs)
    seed(7)
    out_mine = mine(*inputs)
    mode = "train 模式" if train else "eval 模式"
    if isinstance(out_ref, tuple):
        if not isinstance(out_mine, tuple) or len(out_mine) != len(out_ref):
            fail(f"{what}（{mode}）应该返回 {len(out_ref)} 个值的 tuple。")
        for i, (a, b) in enumerate(zip(out_mine, out_ref)):
            if b is None:
                expect(a is None, f"{what}（{mode}）第 {i + 1} 个返回值应为 None。")
            else:
                same(a, b, f"{what}（{mode}）第 {i + 1} 个返回值", atol=atol)
    else:
        same(out_mine, out_ref, f"{what}（{mode}）的输出", atol=atol)
    return out_mine
