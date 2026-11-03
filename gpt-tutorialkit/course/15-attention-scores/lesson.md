---
title: 注意力打分：q · kᵀ，再除以 √head_size
module: m4-attention
goal: 用一次矩阵乘法算出所有位置两两之间的打分，并理解缩放为什么必要。
refs: gpt.py:76-83
---

## 为什么是 q @ kᵀ

位置 i 对位置 j 的打分是 `q_i · k_j`。要算所有 (i, j) 对，用一次矩阵乘法：

```
q            (B, T, hs)
k.transpose  (B, hs, T)      ← 把最后两维互换
q @ kᵀ       (B, T, T)       ← 第 i 行第 j 列 = q_i · k_j
```

`transpose(-2, -1)` 只交换最后两维，第一维 B 保持不动，所以每一段各算各的。

**为什么还要乘 `head_size ** -0.5`？** q、k 每一维大致是方差 1 的随机数，hs 维点积的方差就是 hs。这些打分接下来要过 softmax，数值太大时 softmax 会变得极端：几乎全部权重压在一个位置上。训练初期这会让每个位置只盯着一个字符，梯度也很小，难以学习。除以 √hs 让方差回到 1，softmax 保持「温和」。论文里叫 **Scaled** Dot-Product Attention，指的就是这一步。

```tensors 图解：q @ kᵀ 一次算出所有位置两两之间的打分（T=4, head_size=2，只画一段）
T, hs = 4, 2
dims('q', 'T hs'); dims('k', 'T hs'); dims('kT', 'hs T'); dims('wei', 'T T'); dims('s', 'T')
q = torch.randn(T, hs)                   #: 每个位置的 query：第 i 行 = 位置 i 在找什么
k = torch.randn(T, hs)                   #: 每个位置的 key：第 j 行 = 位置 j 有什么
kT = k.transpose(-2, -1)                 #: 转置：行列互换，`(T, hs)` → `(hs, T)`。真实代码里是 `(B, T, hs)`，`transpose(-2, -1)` 只换最后两维，B 不动
wei = q @ kT                             #: `(T, hs) @ (hs, T) = (T, T)`：第 i 行第 j 列 = `q_i · k_j`，位置 i 对位置 j 的打分
hl('q', S[2]); hl('kT', S[:, 1]); hl('wei', S[2, 1]); show('q', 'kT', 'wei')
(q[2] * k[1]).sum()                      #: 验证一格：`wei[2, 1]` 就是 q 第 2 行和 kᵀ 第 1 列逐个相乘再相加
wei = wei * hs**-0.5                     #: 再乘 `head_size ** -0.5` 缩放。注意右上角（未来）也有分数，下一课遮住
s = torch.randn(8)                       #: 另做个小实验：一行 8 个打分，方差约 1
p_mild = F.softmax(s, dim=-1)            #: softmax 后：权重比较分散，每个位置都分到一些
p_sharp = F.softmax(s * 8, dim=-1)       #: 同一行打分放大 8 倍（相当于 hs=64 却不缩放）：权重几乎全压到最大的那一格
```

<div class="predict">

**先猜一猜**：`hs = 64` 时，不缩放的点积方差大约是多少？

<details><summary>想好了再点开</summary>

约 **64**，标准差约 8。输出后半段把一组打分放大 8 倍后再 softmax，可以看到 80% 的权重集中到了一个位置上；打分再大，就会接近 one-hot。

</details>
</div>

## 你的任务

1. 在 `forward` 里算出 `k`、`q` 和缩放后的打分 `wei`。后面几行已经写好（下两课逐行讲）。
2. 实验里补全 `scaled`。

<details><summary>提示</summary>

`wei = q @ k.transpose(-2, -1) * k.shape[-1]**-0.5`。`k.shape[-1]` 就是 head_size。

</details>

## 通过之后

现在 `wei[b, i, j]` 是位置 i 对位置 j 的打分，但 j > i（未来）的位置也有分数。下一课把它们遮住。
