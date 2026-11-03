---
title: _init_weights：开训前把权重放在好位置
module: m5-gpt
goal: 写出 GPT 的初始化规则，并实测它对初始 loss 的影响。
refs: gpt.py:152-158
---

## 为什么要自己初始化

训练从随机权重出发，起点的好坏会影响训练速度。第 8 课说过，一个什么都不懂的模型最合理的状态是**对 65 个字符一视同仁**，loss ≈ ln 65 ≈ 4.17。

PyTorch 的默认初始化不是为这个模型设计的：logits 的数值偏大，模型一开始就「自信地猜错」，初始 loss 偏高。前面一段训练会浪费在「先把这份没来由的自信压下去」上。

原版的做法来自 GPT-2：

- 所有 `Linear` 和 `Embedding` 的权重从均值 0、**标准差 0.02** 的正态分布里取；
- 所有 `Linear` 的 bias 置 0。

权重很小 → logits 接近 0 → softmax 接近均匀分布 → 初始 loss 接近 4.17。

`self.apply(fn)` 会递归地对模型里的**每一个子模块**（包括 Block 里的 Head 里的 Linear）调用 `fn`，所以 `_init_weights` 只需要判断「这个模块是什么类型」。

Karpathy 在 README 里专门提到，视频里没讲初始化，但它对训练效果很重要。

```tensors 图解：初始化的大小怎么影响一开始的预测（n_embd=8 → vocab=6，4 个位置）
C, V = 8, 6
lm_head = nn.Linear(C, V)
x = torch.randn(4, C)
dims('W', 'V C'); dims('p', 'N V'); dims('p2', 'N V')
W = lm_head.weight.detach().clone()      #: PyTorch 默认初始化的权重：大多在 ±0.1～0.3 之间（每张图的颜色按它自己的最大值算，比大小请看数字）
p = F.softmax(lm_head(x), dim=-1)        #: 4 个位置的预测概率：深浅不一，还没学就有了「偏见」
torch.nn.init.normal_(lm_head.weight, mean=0.0, std=0.02)   #: `normal_` 原地改写权重（带下划线 = 原地修改），返回的就是新权重：都只有 ±0.0x
torch.nn.init.zeros_(lm_head.bias)       #: bias 全部置 0
p2 = F.softmax(lm_head(x), dim=-1)       #: 再看概率：几乎每格都是 1/6 ≈ 0.17，对每个字符一视同仁，初始 loss ≈ ln 6
```

<div class="predict">

**先猜一猜**：用原版初始化和用 PyTorch 默认初始化，初始 loss 分别是多少？

<details><summary>想好了再点开</summary>

在本课配置下实测：原版初始化约 **4.17**，几乎正好是 ln 65；默认初始化约 **4.32**。模型越大，默认初始化下的问题越明显。

</details>
</div>

## 你的任务

补全 `_init_weights` 的两个分支。

<details><summary>提示</summary>

`torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)`，`torch.nn.init.zeros_(module.bias)`。函数名带下划线 `_`，表示原地修改。`Linear` 的 bias 可能是 None（比如 Head 里的 q/k/v），先判断再置 0。

</details>

## 通过之后

LayerNorm 不在这两个分支里，它保持默认值：weight 全 1、bias 全 0，一开始就是「纯归一化」。
