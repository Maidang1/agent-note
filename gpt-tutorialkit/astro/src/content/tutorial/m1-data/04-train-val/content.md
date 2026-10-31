---
type: lesson
title: "张量与训练 / 验证切分"
---

## 为什么需要它

<strong>张量（tensor）</strong>是 PyTorch 装数字的容器，可以理解成带形状、能放到 GPU 上批量计算的多维数组。整本书编码后是一个长约 111 万的一维张量。

`dtype=torch.long` 表示 64 位整数。字符编号是类别标签，不是连续的数值，后面查表（`nn.Embedding`）和算交叉熵（`F.cross_entropy`）都要求它是 long。

再切一刀：<strong>前 90% 训练，后 10% 验证</strong>。训练只用前一份；验证集模型从没见过，用来检查它是学到了规律还是在背书。训练 loss 一直降、验证 loss 却开始升，就是<strong>过拟合</strong>。

<div class="predict">

<strong>先猜一猜</strong>：为什么直接按位置切，而不是随机挑 10% 的字符当验证集？

<details><summary>想好了再点开</summary>

模型学的是<strong>连续文字</strong>里的规律。随机挑单个字符，验证集的字符前后文全都在训练集里，等于泄题。整块切开，验证集才是一段模型真正没读过的文字。

</details>
</div>

## 你的任务

1. 用 `torch.tensor(..., dtype=torch.long)` 把 `encode(text)` 变成张量 `data`。
2. 算出 `n`，切出 `train_data` 和 `val_data`。

<details><summary>提示</summary>

`int(0.9 * len(data))`；切片 `data[:n]` 和 `data[n:]`。

</details>

## 通过之后

输出里 `data.shape` 是 `torch.Size([1115394])`。张量的 `.shape` 你会天天看：下一课开始，它就从一维变成了二维 `(B, T)`。
