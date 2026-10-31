---
type: lesson
title: "注意力之前的数学技巧：前缀平均的三种写法"
---

## 为什么先学这个

Bigram 的问题：每个位置只看自己。要让第 t 个位置知道前文，最简单的办法是<strong>把 0..t 个位置的向量取平均</strong>。平均很粗糙，但它定下了两条规矩：

1. 位置之间要<strong>交流</strong>信息；
2. 只能看<strong>过去</strong>，不能看未来，否则训练时就偷看了答案。

这一课不在 gpt.py 里，它来自 Karpathy 视频中讲注意力之前的「数学技巧」。三种写法结果完全一样，但写法 3 正好是自注意力的形状：

```
wei = 一个 (T, T) 的打分矩阵
wei = 把上三角（未来）填成 -inf
wei = softmax(wei)          ← 每行变成和为 1 的权重，-inf 变成 0
out = wei @ x               ← 按权重加权求和
```

写法 3 里打分全是 0，softmax 后就是均匀平均。<strong>自注意力只改一处</strong>：打分不再是常数 0，而是由数据算出来的（下两课的 `q @ kᵀ`）。于是每个位置可以自己决定更关注前文的哪些字符。

<div class="predict">

<strong>先猜一猜</strong>：`T=4` 时，写法 2 里的 `wei` 长什么样？

<details><summary>想好了再点开</summary>

```
1    0    0    0
1/2  1/2  0    0
1/3  1/3  1/3  0
1/4  1/4  1/4  1/4
```

第 t 行有 t+1 个相同的权重。`wei @ x` 的第 t 行恰好就是 x 前 t+1 行的平均。

</details>
</div>

## 你的任务

依次补全三种写法。

<details><summary>提示 1：循环写法</summary>

`x[b, :t+1]` 形状是 `(t+1, C)`；`torch.mean(xprev, 0)` 沿第 0 维平均，得到 `(C,)`。

</details>

<details><summary>提示 2：矩阵写法</summary>

`wei.sum(1, keepdim=True)` 形状是 `(T, 1)`，`wei / 它` 会按行广播相除。`(T, T) @ (B, T, C)` 时 PyTorch 会把 `wei` 广播到每一段。

</details>

<details><summary>提示 3：softmax 写法</summary>

`wei.masked_fill(tril == 0, float('-inf'))`，然后 `F.softmax(wei, dim=-1)`。`e^(-inf) = 0`，所以被填的位置权重正好是 0。

</details>

## 通过之后

记住写法 3 的四行，接下来 4 课会把它一点点变成 gpt.py 第 64–90 行的 `Head`。
