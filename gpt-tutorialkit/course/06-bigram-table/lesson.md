---
title: Bigram 模型：一张 65 × 65 的打分表
module: m2-bigram
goal: 用 nn.Embedding 建出 Bigram 模型唯一的一张参数表。
refs: bigram.py:60-66
---

## 为什么先做 Bigram

GPT 很复杂，但「输入字符编号 → 对下一个字符打分 → 算 loss → 训练 → 生成」这条流水线和模型复杂度无关。先用最简单的模型把流水线搭通，后面只需要把模型换成 GPT。

**Bigram** 只看**上一个字符**来猜下一个。所以它需要的全部知识就是一张表：

| 上一个字符 | 对下一个字符的打分（65 个） |
|---|---|
| `h` | `a`: 1.2, `e`: 2.8, `i`: 1.9, … |
| `q` | `u`: 5.0, 其他都很低 … |

一行 65 个分数，一共 65 行。这张表一开始是随机数，训练会把它调成「英文里 `q` 后面大概率是 `u`」这样的统计规律。

`nn.Embedding(num, dim)` 就是一张 `num × dim` 的可学习表，用整数编号去取对应的那一行。在 GPT 里它会用来存「每个字符的向量」；在 Bigram 里，那一行直接当作打分。

<div class="predict">

**先猜一猜**：这个模型一共有多少个可学习的参数？

<details><summary>想好了再点开</summary>

**4225** = 65 × 65。整个模型就这一张表。作为对比，本课用的小 GPT 有约 3 万个参数，原版 GPT 有 1080 万个。

</details>
</div>

## 你的任务

1. 在 `__init__` 里建 `self.token_embedding_table`。
2. 数出 `n_params`。

<details><summary>提示 1</summary>

`nn.Embedding(vocab_size, vocab_size)`。属性名必须是 `token_embedding_table`，判题器会按名字把原版权重灌进来比对。

</details>

<details><summary>提示 2</summary>

`model.parameters()` 依次给出每个参数张量，`p.numel()` 是它的元素个数：`sum(p.numel() for p in model.parameters())`。

</details>

## 通过之后

`super().__init__()` 必须写在最前面：`nn.Module` 靠它登记子模块和参数，`model.parameters()` 才能找到这张表，优化器才能更新它。
