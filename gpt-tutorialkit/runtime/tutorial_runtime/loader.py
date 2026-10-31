"""tutorial_runtime.load_original
==============================

按课程硬约束实现的运行辅助加载器。

`ns = load_original('bigram' | 'gpt', overrides={...})` 返回一个 dict，
其中安全装载了原版的导入、超参数、随机种子、数据、函数与类；
**绝不执行** 原版末尾的 model 实例化、optimizer、训练循环与生成。

设计要点（与 course-spec.md 对齐）：
- 只截取原版到 `model = <Model>(...)` 之前的前缀，用 compile 以真实文件名编译，
  保留原版定义行号；异常 traceback 指向原版行。
- exec 时传入的 namespace 同时作为该段代码的 globals，因此 get_batch /
  estimate_loss 等函数的 `__globals__` 就是 ns，后续对 ns 里超参数的覆盖会在
  函数被调用时实时生效（例如改 block_size 后 get_batch 立即使用新值）。
- 原版 `open('input.txt')` 通过命名空间内的受控 open 重定向到包内随附的
  固定语料（任意 cwd 都能跑）；其它 open 原样转发，不掩盖课程里故意制造的
  FileNotFoundError 等异常。
- 基础轻量覆盖由本运行时统一施加（教学配置），调用方 overrides 再叠加其上；
  learning_rate 保持原版；device 仍是 `cuda 否则 cpu`，绝不选 MPS。
- 每次调用固定 seed 1337、限制线程数；权重不跨调用共享（每次全新 exec）。
"""

from __future__ import annotations

import builtins
from pathlib import Path
from typing import Any

_PKG_DIR = Path(__file__).resolve().parent
_ORIG_DIR = _PKG_DIR / "_originals"
_BUNDLED_INPUT = _PKG_DIR / "input.txt"
CORPUS = str(_BUNDLED_INPUT)  # 随附的 tinyshakespeare，结业课直接 open 它

PINNED_COMMIT = "52201428ed7b46804849dea0b3ccf0de9df1a5c3"

# 截取前缀的分界：在原版第一次出现 “model = <Class>(...)” 处截断。
# 这些行之后是实例化 / optimizer / 训练 / 生成，必须被排除。
_MODEL_MARKER = {
    "bigram": "model = BigramLanguageModel(",
    "gpt": "model = GPTLanguageModel(",
}

# 运行时统一施加的基础轻量教学覆盖（单位：本机快速观察）。
# 调用方 overrides 会在这些值之上再覆盖。
_BASE_LIGHT_OVERRIDES = {
    "batch_size": 4,
    "block_size": 8,
    "max_iters": 12,
    "eval_interval": 6,
    "eval_iters": 3,
    # 以下仅 gpt.py 相关，bigram 里不存在，写入无害（不会被读取）
    "n_embd": 32,
    "n_head": 4,
    "n_layer": 2,
    "dropout": 0.1,
}

_NUM_THREADS = 2  # 限制 CPU 内并行线程，保证可复现、不抢资源


class _GuardedOpen:
    """只把字面量 'input.txt' 重定向到包内固定语料，其余原样转发。"""

    def __init__(self, real_open):
        self._real = real_open

    def __call__(self, file, *args, **kwargs):
        if file == "input.txt":
            return self._real(str(_BUNDLED_INPUT), *args, **kwargs)
        return self._real(file, *args, **kwargs)


def _read_prefix(which: str) -> tuple[Path, str]:
    path = _ORIG_DIR / f"{which}.py"
    if not path.exists():
        raise FileNotFoundError(f"未找到随附原版源码: {path}")
    src = path.read_text(encoding="utf-8")
    marker = _MODEL_MARKER[which]
    idx = src.find(marker)
    if idx == -1:
        raise ValueError(f"在 {path.name} 中未找到模型实例化标记 {marker!r}")
    # 截到标记所在行之前，保留前面所有空行与注释，行号自洽。
    prefix = src[:idx]
    return path, prefix


def load_original(which: str, overrides: dict | None = None) -> dict[str, Any]:
    which = str(which).lower()
    if which not in _MODEL_MARKER:
        raise ValueError(f"load_original 仅接受 'bigram' 或 'gpt'，收到 {which!r}")

    path, prefix = _read_prefix(which)

    # namespace 同时作为 globals：exec 出的函数会把它当 __globals__。
    ns: dict[str, Any] = {"__name__": f"tutorial_original_{which}", "__file__": str(path)}
    # 受控 open：把相对路径 input.txt 指向包内固定语料，不影响其它 open。
    ns["open"] = _GuardedOpen(builtins.open)

    code = compile(prefix, str(path), "exec")
    exec(code, ns)  # noqa: S102 - 这是教学运行时有意为之：装载安全的原版前缀

    import torch  # 局部导入，复用同一份 torch

    # 运行时统一施加基础轻量覆盖（在 exec 出的原始超参数之上）。
    for key, value in _BASE_LIGHT_OVERRIDES.items():
        ns[key] = value

    # 调用方 overrides 最后叠加，优先生效。
    for key, value in (overrides or {}).items():
        ns[key] = value

    # 固定随机序列起点 + 限制线程数（每次调用独立，权重不共享）。
    torch.manual_seed(1337)
    try:
        torch.set_num_threads(_NUM_THREADS)
    except Exception:
        pass

    # 把 pinned 来源信息也放进 ns，便于课程面板显示来源映射。
    ns["_tutorial"] = {
        "which": which,
        "source_file": path.name,
        "pinned_commit": PINNED_COMMIT,
        "base_overrides": dict(_BASE_LIGHT_OVERRIDES),
        "user_overrides": dict(overrides or {}),
    }
    return ns
