---
title: Head 的零件：query、key、value 和一个下三角
module: m4-attention
goal: 建出一个注意力头需要的所有部件，理解 q / k / v 各自的角色。
refs: gpt.py:64-74
---

## 为什么要 q、k、v 三个投影

上一课的注意力权重是常数，每个位置对前文一视同仁。自注意力想让权重**由内容决定**：比如当前字符是 `q`，它可能特别想找前面有没有 `u`。

做法是让每个位置的向量 x 通过三个不同的线性层，各产出一个 `head_size` 维的向量：

| 名字 | 比喻 |
|---|---|
| **query** `q = Wq·x` | 我在找什么 |
| **key** `k = Wk·x` | 我有什么，供别人匹配 |
| **value** `v = Wv·x` | 如果你关注我，我交给你什么 |

位置 i 对位置 j 的关注程度 = `q_i · k_j`（点积，越大越匹配）。三个矩阵都是学出来的，训练会自己找出有用的「找什么 / 有什么」。

`tril` 就是上一课的下三角矩阵。它不需要训练，但要随模型一起 `.to(device)`、一起存档，所以用 `register_buffer` 登记，而不是普通属性或参数。

```tensors 图解：x 经过三个 Linear，变成 k、q、v（n_embd=4 → head_size=2；只画一段，T=3）
n_embd, head_size, T = 4, 2, 3
key = nn.Linear(n_embd, head_size, bias=False)
query = nn.Linear(n_embd, head_size, bias=False)
value = nn.Linear(n_embd, head_size, bias=False)
dims('x', 'T C'); dims('Wk', 'hs C'); dims('k', 'T hs'); dims('q', 'T hs'); dims('v', 'T hs'); dims('tril', 'T T')
x = torch.randn(T, n_embd)               #: 输入：3 个位置，每个位置一个 4 维向量
Wk = key.weight                          #: key 的权重：形状是 `(输出, 输入) = (2, 4)`。query、value 各有一份同样形状、数值不同的
k = key(x)                               #: `key(x)` 就是 `x @ Wkᵀ`：每个位置的 4 个数被压成 2 个
hl('x', S[1]); hl('Wk', S[0]); hl('k', S[1, 0]); show('x', 'Wk', 'k')
x[1] @ Wk[0]                             #: 看一个格子：`k[1, 0]` = x 第 1 行和 Wk 第 0 行逐个相乘再相加
q, v = query(x), value(x)                #: query、value 同样算，但权重不同，所以 k、q、v 内容各不相同
tril = torch.tril(torch.ones(T, T))      #: `tril` 这个 buffer：下三角全 1，第 t 行标出位置 t 能看见哪些位置
```

<div class="predict">

**先猜一猜**：本课 `n_embd=32`、`head_size=8`，一个 Head 有多少个可训练参数？

<details><summary>想好了再点开</summary>

**768** = 3 × 32 × 8。三个无 bias 的线性层，tril 和 dropout 都没有可训练参数。

</details>
</div>

## 你的任务

补全 `__init__`：三个 Linear、一个 buffer、一个 Dropout。

<details><summary>提示 1</summary>

`nn.Linear(n_embd, head_size, bias=False)`。三行顺序要和原版一样（key、query、value）：权重初始化按创建顺序消耗随机数，顺序不同，判题时初始值就对不上。

</details>

<details><summary>提示 2</summary>

`self.register_buffer('tril', torch.tril(torch.ones(block_size, block_size)))`。

</details>

## 通过之后

`nn.Linear` 的 weight 形状是 `(输出, 输入)`，所以打印出来是 `(8, 32)`。下一课在 forward 里用它们算出注意力打分。
