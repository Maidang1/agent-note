---
title: 训练你的 GPT
module: m6-train-gpt
goal: 重写一遍训练循环，在本机 CPU 上把 GPT 训到明显超过 Bigram。
refs: gpt.py:206-220
---

## 为什么还要再写一遍

和第 12 课几乎一样，这是有意的：GPT 和 Bigram 接口相同，训练循环一个字都不用为模型改。唯一的区别在评估条件：

```python
if iter % eval_interval == 0 or iter == max_iters - 1:
```

GPT 版本**最后一步也评估一次**，这样总能看到训练结束时的成绩。

本课配置：`block_size=32`、`n_embd=64`、3 层、学习率 `1e-3`，约 16 万参数，1000 步。比原版小很多，但上下文从 8 扩到 32，模型能看到的上文足够跨过一个单词了。

<div class="predict">

**先猜一猜**：第 12 课 Bigram 训了 3000 步，val loss 停在约 2.49。这个小 GPT 训 1000 步能到多少？

<details><summary>想好了再点开</summary>

约 **2.17**，而且还在往下降。区别全在「能看上文」：Bigram 只看 1 个字符，GPT 能看 32 个。原版 GPU 训 5000 步可以到 1.48，生成的文字已经很像莎士比亚了。

</details>
</div>

## 你的任务

补全训练循环：评估、抽数据、训练一步。

<details><summary>提示</summary>

照着第 12 课写，只改评估条件。训练一步就是第 10 课的四行。

</details>

## 通过之后

对比生成的文字和第 12 课：已经能拼出 `the`、`and`、`thou` 这样的短词，还有「角色名 + 冒号 + 换行」的剧本格式。训练越久、模型越大，就越像原文。
