---
type: lesson
title: "交叉熵：给「猜得有多差」打一个分"
---

## 为什么是交叉熵

模型对每个位置给出 65 个打分。先用 <strong>softmax</strong> 把它们变成概率（全为正、加起来等于 1），再看<strong>正确答案那个字符分到了多少概率</strong> p：

- p 接近 1：猜得很好，`-log(p)` 接近 0
- p 很小：猜得很差，`-log(p)` 很大

把 B×T 个位置的 `-log(p)` 取平均，就是<strong>交叉熵损失</strong>。训练的目标就是把这个数压低，也就是让正确答案分到更多的概率。

`F.cross_entropy` 把 softmax、取值、`-log`、平均一步做完，但它要求输入形状是 `(N, C)` 和 `(N,)`。所以原版先用 `.view` 把 `(B, T, C)` 摊平成 `(B*T, C)`。`.view` 只改变形状的「看法」，不复制、不改动数据。

<div class="predict">

<strong>先猜一猜</strong>：模型还没训练、打分基本随机时，loss 大约是多少？

<details><summary>想好了再点开</summary>

约 <strong>4.17</strong>。完全不会时，最好的策略是 65 个字符平均分配概率，p = 1/65，`-ln(1/65) = ln 65 ≈ 4.17`。如果初始 loss 明显高于这个数，说明模型一开始就「自信地猜错」，初始化有问题（第 22 课还会讲到）。

</details>
</div>

## 你的任务

1. 补全 `forward` 里 `targets` 不为 None 的分支（4 行）。
2. 手算交叉熵：`p_correct` 和 `manual_loss`。

<details><summary>提示 1：摊平</summary>

`B, T, C = logits.shape`，然后 `logits.view(B*T, C)`、`targets.view(B*T)`。

</details>

<details><summary>提示 2：每行取一个指定列</summary>

`probs[行下标张量, 列下标张量]` 会逐对取值。行下标是 `torch.arange(N)`，列下标就是 `targets`。

</details>

## 通过之后

两个 loss 应该一致，都在 4.2 到 4.9 之间。同一个模型有两种用法：训练时传 `targets` 拿 loss，生成时不传、只拿 logits。下一课就写生成。
