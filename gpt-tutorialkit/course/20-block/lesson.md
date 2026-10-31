---
title: Block：LayerNorm + 注意力 + 前馈 + 残差
module: m4-attention
goal: 把注意力和前馈装进一个 Block，用残差连接和预归一化让深层网络能训练。
refs: gpt.py:121-136
---

## 为什么要这样包一层

一个 Block = 交流（多头注意力）+ 计算（前馈）。GPT 就是把 Block 叠很多层。但简单叠起来，网络一深就很难训练。原版用了两个关键技巧：

**1. 残差连接** `x = x + 子层(x)`

子层不直接替换 x，而是算出一个「修改量」加回去。好处：

- 梯度可以沿着 `+` 号直接流回前面的层，深层网络不再因为梯度一层层衰减而学不动。
- 刚初始化时子层输出很小，整个 Block 接近「什么都不做」，网络从一个稳定的起点开始，慢慢学到有用的修改。

可以想象一条贯穿所有层的「主干道」（residual stream），每个子层从路上读信息、算完再把结果加回路上。

**2. LayerNorm（预归一化）** `子层(ln(x))`

LayerNorm 把**每个位置**的向量归一化成均值 0、标准差 1，再乘上可学习的缩放、加上偏移。这样子层收到的输入尺度稳定，不会因为前面层的输出越加越大而失控。原版 Transformer 论文把 LayerNorm 放在残差相加**之后**；现在普遍放在子层**之前**（pre-norm），训练更稳。gpt.py 用的就是 pre-norm。

<div class="predict">

**先猜一猜**：如果把 `x = x + self.sa(self.ln1(x))` 写成 `x = self.sa(self.ln1(x))`，输出形状会变吗？会出什么问题？

<details><summary>想好了再点开</summary>

形状**不变**，代码能跑。但残差没了：输入的信息只能经过注意力层才能传到后面，深层网络会难以训练。第三条检查就是专门抓这个错误的：把两个子层的输出清零，有残差的 Block 应该原样传出输入。

</details>
</div>

## 你的任务

补全 `__init__`（5 行）和 `forward`（2 行）。

<details><summary>提示 1：部件</summary>

`head_size = n_embd // n_head`；`MultiHeadAttention(n_head, head_size)`；`FeedFoward(n_embd)`；两个 `nn.LayerNorm(n_embd)`。按 sa、ffwd、ln1、ln2 的顺序创建。

</details>

<details><summary>提示 2：forward</summary>

`x = x + self.sa(self.ln1(x))`，第二行同理。

</details>

## 通过之后

**模块 4 完成：你亲手写出了 Transformer 的核心。**GPT 剩下的部分只是：在最前面把字符变成向量，在最后面把向量变回打分。
