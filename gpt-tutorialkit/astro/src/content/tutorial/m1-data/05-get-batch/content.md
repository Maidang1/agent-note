---
type: lesson
title: "get_batch：随机剪一批「题目 + 答案」"
---

## 为什么需要它

整本书有 100 万个字符，不可能一次塞给模型。训练时每一步只拿一小批：随机挑 `batch_size` 个起点，每个起点往后剪 `block_size` 个字符。这一批就是形状 `(B, T)` 的整数张量 `x`。

答案 `y` 不需要人标注：<strong>把同一段往右挪一格</strong>就是了。`x[b, t]` 位置要预测的「下一个字符」正是原文里紧跟着的那一个，也就是 `y[b, t]`。

| 位置 t | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| x | F | i | r | s |
| y（下一个） | i | r | s | t |

关键点：一段长度为 T 的 x 里同时藏着 T 道题——「看到前 1 个字符猜第 2 个」「看到前 2 个猜第 3 个」……一直到「看到全部 T 个猜第 T+1 个」。GPT 一次 forward 就把这 T 道题全做了。

<div class="predict">

<strong>先猜一猜</strong>：`B=4, T=8` 时，一次 `get_batch` 一共提供了多少道「猜下一个字符」的练习题？起点 `ix` 最大可以取到多少（用 `len(data)` 和 `block_size` 表示）？

<details><summary>想好了再点开</summary>

<strong>32 道</strong>（4 段 × 每段 8 个位置）。起点要保证 `i + block_size` 还在数据里（y 要多取一个字符），所以 `torch.randint(len(data) - block_size, ...)` 抽出的是 `0 … len(data)-block_size-1`。

</details>
</div>

## 你的任务

在右侧 `get_batch` 里补三处 TODO：

1. 用 `torch.randint(上限, (batch_size,))` 抽 `batch_size` 个起点 `ix`。
2. 对每个起点 `i` 取 `data[i : i+block_size]`，用 `torch.stack` 堆成 `(B, T)` 的 `x`。
3. 同样方式取「右移一格」的 `y`。

写完先<strong>运行</strong>看看打印出的「看到 → 该猜」对照，再<strong>检查</strong>。

<details><summary>提示 1：torch.randint 和 torch.stack 怎么用</summary>

`torch.randint(high, size)` 返回 `[0, high)` 里的随机整数，`size` 是形状元组，例如 `(4,)`。`torch.stack([t1, t2, t3])` 把几个形状相同的一维张量叠成二维，新维度放在最前面。

</details>

<details><summary>提示 2：要和原版完全一致</summary>

判题时会用同一个随机种子比较你和原版的结果，所以随机数只能调用一次 `torch.randint`，且上限必须是 `len(data) - block_size`。y 的切片是 `data[i+1 : i+block_size+1]`。

</details>

## 通过之后

- 原版最后一行 `x.to(device)` 把数据搬到 GPU（如果有）。模型和数据必须在同一个设备上才能计算。
- 小实验：把 `block_size` 临时改成 3 再运行，「看到 → 该猜」的对照会变成几行？
