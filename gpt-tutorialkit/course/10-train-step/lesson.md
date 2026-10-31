---
title: 训练一步：前向、清梯度、反向、更新
module: m3-train
goal: 写出训练一步的四行代码，并亲眼看到参数被更新、loss 下降。
refs: bigram.py:101-102, bigram.py:114-118
---

## 为什么是这四步

训练就是反复做一件事：**让正确答案的概率稍微高一点**。每一步四行：

| 代码 | 做什么 |
|---|---|
| `logits, loss = model(xb, yb)` | 前向：算出这批题的 loss |
| `optimizer.zero_grad()` | 清空上一步留下的梯度 |
| `loss.backward()` | 反向传播：求出每个参数的**梯度**——参数往哪个方向变、能让 loss 降得最快 |
| `optimizer.step()` | 优化器沿梯度的反方向把每个参数挪一小步 |

为什么要 `zero_grad`？PyTorch 的 `.backward()` 是把新梯度**加到** `.grad` 上，不是覆盖。不清零，这一步就会带着之前所有步的梯度去更新。

**AdamW** 是原版选的优化器：在「沿梯度走一小步」的基础上，给每个参数自适应地调步长。`lr`（学习率）控制步子大小，Bigram 用 `1e-2`。

<div class="predict">

**先猜一猜**：这批 x 里出现了约 20 种不同字符。backward 之后，65 × 65 的表里有多少**行**会拿到非零梯度？

<details><summary>想好了再点开</summary>

**正好是这批 x 里出现过的字符数**。forward 只查了这些行，其他行没参与计算，梯度就是 0。输出第二行可以验证。

</details>
</div>

## 你的任务

按顺序补全 `train_step` 的四行。

<details><summary>提示</summary>

`set_to_none=True` 是原版的写法：把梯度设成 None 而不是填 0，省一点内存，效果一样。

</details>

## 通过之后

同一批练 200 步，loss 会掉到 2 以下。这不说明模型变聪明了：它只是把这 32 道题背了下来。下一课用 `estimate_loss` 在**很多随机批**和**验证集**上看真实水平。
