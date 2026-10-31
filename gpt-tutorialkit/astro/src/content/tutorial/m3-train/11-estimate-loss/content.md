---
type: lesson
title: "estimate_loss：用平均分看模型的真实水平"
---

## 为什么不直接看训练时的 loss

训练循环里每一步的 loss 只来自一小批随机数据，噪声很大：这批简单就低，那批难就高。想知道模型现在到底多好，需要：

1. <strong>多批取平均</strong>：各抽 `eval_iters` 批，平均下来更稳。
2. <strong>同时看 train 和 val</strong>：val 是模型没见过的数据。两者接近，说明学到的是通用规律；train 远低于 val，说明在死记训练集（过拟合）。

还有两个和训练不同的开关：

- `@torch.no_grad()`：不记录计算图、不算梯度。评估不需要反向传播，这样更快、更省内存。
- `model.eval()` / `model.train()`：有些层在训练和评估时行为不同，比如 dropout（第 16 课）。评估前切到 eval，结束后<strong>一定要切回</strong> train，否则后面的训练就悄悄关掉了 dropout。Bigram 没有这类层，但原版保持了这个好习惯。

<div class="predict">

<strong>先猜一猜</strong>：模型还没训练，train loss 和 val loss 谁高？差多少？

<details><summary>想好了再点开</summary>

<strong>几乎一样</strong>，都在 4.7 左右。没训练的模型对两份数据一样陌生。两者开始拉开差距，是训练之后的事。

</details>
</div>

## 你的任务

1. 在 `def` 上方加装饰器。
2. 补全 `model.eval()`、循环体、`model.train()`。

<details><summary>提示 1：循环体结构</summary>

```
losses = torch.zeros(eval_iters)
for k in range(eval_iters):
    X, Y = 抽一批 split
    _, loss = model(X, Y)
    losses[k] = loss.item()
out[split] = losses.mean()
```

</details>

<details><summary>提示 2：.item() 是做什么的</summary>

`loss` 是只有一个元素的张量，`.item()` 把它变成普通 Python 浮点数，再存进 `losses`。

</details>

## 通过之后

看输出后半段：同一个模型，单批 val loss 能差出零点几。这就是为什么要取平均。
