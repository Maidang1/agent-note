---
title: 因果掩码：未来的字符必须看不见
module: m4-attention
goal: 用 masked_fill 把未来位置的打分变成 -inf，再 softmax 成权重。
refs: gpt.py:84-85
---

## 为什么必须遮住未来

一段长度为 T 的训练数据里，同时有 T 道「猜下一个字符」的题。第 t 道题的答案就是第 t+1 个字符，它也在输入里。如果位置 t 能看到 t+1，模型只要学会「抄下一个字符」，训练 loss 就能接近 0，但生成时根本没有下一个字符可抄。

所以打分矩阵的上三角（j > i）要在 softmax **之前**填成 `-inf`。`e^(-inf) = 0`，这些位置分到的权重正好是 0，每一行剩下的权重加起来仍然是 1。这就是第 13 课写法 3 的那两行。

为什么是 `self.tril[:T, :T]`？`tril` 按 `block_size` 建好，但输入可能更短（比如生成的头几步只有 1、2 个字符），所以只取左上角 T × T。

```tensors 图解：先遮住未来，再 softmax（T=4，只画一段）
T = 4
dims('wei', 'T T'); dims('tril', 'T T'); dims('mask', 'T T'); dims('wrong', 'T T')
wei = torch.randn(T, T)                  #: 上一课算出的打分：每个位置对**所有**位置都有分，包括未来（右上角）
scores = wei.clone()
tril = torch.tril(torch.ones(T, T))      #: `self.tril[:T, :T]`：下三角全 1
mask = tril == 0                         #: `tril == 0`：右上角为 T（True），就是要遮住的「未来」
wei = wei.masked_fill(mask, float('-inf'))   #: 为 True 的位置换成 −∞（斜线格）
wei = F.softmax(wei, dim=-1)             #: 每行 softmax：−∞ 变成 0，剩下的权重加起来是 1
wei.sum(dim=-1)                          #: 每行的和：全是 1
wrong = F.softmax(scores, dim=-1).masked_fill(mask, 0.0)   #: 反例：先 softmax 再把未来填 0
wrong.sum(dim=-1)                        #: 每行的和不再是 1：softmax 时未来位置已经分走了一部分（只有最后一行没有未来，才刚好是 1）
```

<div class="predict">

**先猜一猜**：如果把 masked_fill 写在 softmax **之后**（填 0 而不是 -inf），会出什么问题？

<details><summary>想好了再点开</summary>

未来位置的权重确实变成了 0，但每行剩下的权重加起来**不再是 1**：softmax 时未来位置已经分走了一部分。输出的尺度会随位置变化，而且仍然是错误的计算。先遮再 softmax，才能让可见位置的权重和为 1。

</details>
</div>

## 你的任务

补全 `masked_fill` 和 `softmax` 两行。

<details><summary>提示</summary>

`wei.masked_fill(条件, 值)` 把条件为 True 的位置换成值。条件是 `self.tril[:T, :T] == 0`。softmax 沿最后一维：`dim=-1`。

</details>

## 通过之后

输出里的因果性测试是检查注意力实现最直接的办法：改后面，前面不动。注意，GPT 这种只看过去的叫**解码器（decoder）**注意力；做翻译的编码器会去掉这个掩码，让每个位置看到全句。
