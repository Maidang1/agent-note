---
title: estimate_loss：用平均分看模型的真实水平
module: m3-train
goal: 写出 estimate_loss，理解 no_grad、eval/train 模式，以及为什么要在多批上取平均。
refs: bigram.py:46-58, gpt.py:50-62
---

## 为什么不直接看训练时的 loss

训练循环里每一步的 loss 只来自一小批随机数据，噪声很大：这批简单就低，那批难就高。想知道模型现在到底多好，需要：

1. **多批取平均**：各抽 `eval_iters` 批，平均下来更稳。
2. **同时看 train 和 val**：val 是模型没见过的数据。两者接近，说明学到的是通用规律；train 远低于 val，说明在死记训练集（过拟合）。

还有两个和训练不同的开关：

- `@torch.no_grad()`：不记录计算图、不算梯度。评估不需要反向传播，这样更快、更省内存。
- `model.eval()` / `model.train()`：有些层在训练和评估时行为不同，比如 dropout（第 16 课）。评估前切到 eval，结束后**一定要切回** train，否则后面的训练就悄悄关掉了 dropout。Bigram 没有这类层，但原版保持了这个好习惯。

```tensors 图解：losses 这个一维张量是怎么被填满的（eval_iters = 5）
table = nn.Embedding(65, 65)
data = torch.randint(65, (2000,))
def get_batch(split):
    ix = torch.randint(len(data) - 8, (4,))
    return torch.stack([data[i:i+8] for i in ix]), torch.stack([data[i+1:i+9] for i in ix])
def model(X, Y):
    return None, F.cross_entropy(table(X).view(-1, 65), Y.view(-1))
eval_iters = 5
dims('losses', 'eval_iters')
losses = torch.zeros(eval_iters)         #: 先准备 5 个空位
X, Y = get_batch('val')
logits, loss = model(X, Y)
hl('losses', S[0]); show('losses')
losses[0] = loss.item()                  #: k = 0：抽一批、算 loss，`.item()` 变成普通数字，填进第 0 格
show('losses')
for k in range(1, eval_iters):
    X, Y = get_batch('val')
    logits, loss = model(X, Y)
    losses[k] = loss.item()              #: 循环做完 5 批：每批的 loss 都不太一样，这就是单批的噪声
mean = losses.mean()                     #: 平均成一个数，存进 `out['val']`。批数越多，越稳定
```

<div class="predict">

**先猜一猜**：模型还没训练，train loss 和 val loss 谁高？差多少？

<details><summary>想好了再点开</summary>

**几乎一样**，都在 4.7 左右。没训练的模型对两份数据一样陌生。两者开始拉开差距，是训练之后的事。

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
