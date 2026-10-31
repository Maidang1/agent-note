---
type: lesson
title: "注意力打分：q · kᵀ，再除以 √head_size"
---

## 为什么是 q @ kᵀ

位置 i 对位置 j 的打分是 `q_i · k_j`。要算所有 (i, j) 对，用一次矩阵乘法：

```
q            (B, T, hs)
k.transpose  (B, hs, T)      ← 把最后两维互换
q @ kᵀ       (B, T, T)       ← 第 i 行第 j 列 = q_i · k_j
```

`transpose(-2, -1)` 只交换最后两维，第一维 B 保持不动，所以每一段各算各的。

<strong>为什么还要乘 `head_size ** -0.5`？</strong> q、k 每一维大致是方差 1 的随机数，hs 维点积的方差就是 hs。这些打分接下来要过 softmax，数值太大时 softmax 会变得极端：几乎全部权重压在一个位置上。训练初期这会让每个位置只盯着一个字符，梯度也很小，难以学习。除以 √hs 让方差回到 1，softmax 保持「温和」。论文里叫 <strong>Scaled</strong> Dot-Product Attention，指的就是这一步。

<div class="predict">

<strong>先猜一猜</strong>：`hs = 64` 时，不缩放的点积方差大约是多少？

<details><summary>想好了再点开</summary>

约 <strong>64</strong>，标准差约 8。输出后半段把一组打分放大 8 倍后再 softmax，可以看到 80% 的权重集中到了一个位置上；打分再大，就会接近 one-hot。

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
