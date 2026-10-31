---
type: lesson
title: "训练前的准备：搬到设备、数参数、建优化器"
---

## 为什么这三行

```python
m = model.to(device)          # 参数搬到 GPU（如果有）
print(参数量)
optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)
```

`.to(device)` 把所有参数和 buffer（比如 Head 里的 `tril`）搬到同一个设备，返回的还是同一个模型对象，所以原版后面混用 `m` 和 `model` 没有问题。

<strong>学习率</strong>：Bigram 用 `1e-2`，GPT 用 `3e-4`，小了 30 倍。模型越深，每个参数的改动经过层层放大后对输出影响越大，步子太大容易训崩。这是经验值，原版没有专门调过。

<strong>参数都在哪？</strong> 记 C = n_embd，一个 Block 里：

| 部件 | 参数 |
|---|---|
| 所有头的 q、k、v（无 bias，总宽 C） | 3C² |
| 注意力的 proj | C² + C |
| 前馈两层（C→4C→C） | 8C² + 5C |
| 两个 LayerNorm | 4C |

合计 <strong>12C² + 10C</strong>。参数量和头数无关，只看宽度 C 的平方。原版 C=384，单个 Block 就有 177 万参数。

<div class="predict">

<strong>先猜一猜</strong>：原版尺寸（C=384、6 层、block_size=256）的 GPT 有多少参数？

<details><summary>想好了再点开</summary>

约 <strong>1079 万</strong>（10.79M）。6 个 Block 占了约 1062 万，嵌入表和输出头只占很小一部分。作为对比，GPT-2 最小版是 1.24 亿，GPT-3 是 1750 亿。

</details>
</div>

## 你的任务

1. 把模型搬到设备，数出参数量。
2. 写出每个 Block 的参数公式。
3. 建 AdamW 优化器。
4. 数一数原版尺寸 GPT 的参数量。

<details><summary>提示：公式</summary>

把上面表格最后一列加起来：`3*C**2 + (C**2 + C) + (8*C**2 + 5*C) + 4*C`。

</details>

## 通过之后

原版第 201 行打印的就是这个数。下一课开始训练。
