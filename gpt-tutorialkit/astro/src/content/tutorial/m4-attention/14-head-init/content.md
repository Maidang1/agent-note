---
type: lesson
title: "Head 的零件：query、key、value 和一个下三角"
---

## 为什么要 q、k、v 三个投影

上一课的注意力权重是常数，每个位置对前文一视同仁。自注意力想让权重<strong>由内容决定</strong>：比如当前字符是 `q`，它可能特别想找前面有没有 `u`。

做法是让每个位置的向量 x 通过三个不同的线性层，各产出一个 `head_size` 维的向量：

| 名字 | 比喻 |
|---|---|
| <strong>query</strong> `q = Wq·x` | 我在找什么 |
| <strong>key</strong> `k = Wk·x` | 我有什么，供别人匹配 |
| <strong>value</strong> `v = Wv·x` | 如果你关注我，我交给你什么 |

位置 i 对位置 j 的关注程度 = `q_i · k_j`（点积，越大越匹配）。三个矩阵都是学出来的，训练会自己找出有用的「找什么 / 有什么」。

`tril` 就是上一课的下三角矩阵。它不需要训练，但要随模型一起 `.to(device)`、一起存档，所以用 `register_buffer` 登记，而不是普通属性或参数。

<div class="predict">

<strong>先猜一猜</strong>：本课 `n_embd=32`、`head_size=8`，一个 Head 有多少个可训练参数？

<details><summary>想好了再点开</summary>

<strong>768</strong> = 3 × 32 × 8。三个无 bias 的线性层，tril 和 dropout 都没有可训练参数。

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
