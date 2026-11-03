---
title: 前馈层：每个位置自己消化一下
module: m4-attention
goal: 写出 FeedFoward：先扩宽 4 倍，过非线性，再压回来。
refs: gpt.py:106-119
---

## 为什么注意力之后还要一层

注意力做的是**加权平均**，本质上是线性的混合：它把别的位置的信息搬过来，但不太会对这些信息做复杂的加工。前馈层给每个位置一个小型的两层神经网络，**各位置独立、共用同一套权重**：

```
(B,T,32) ─ Linear → (B,T,128) ─ ReLU ─ Linear → (B,T,32) ─ Dropout
```

- 中间扩到 4 倍宽，是原版 Transformer 论文的设定，给网络更多空间做计算。
- **ReLU**（`max(0, x)`）是非线性。没有它，两个 Linear 叠起来仍然等价于一个 Linear，多一层白搭。

Karpathy 的说法：注意力是位置之间的**交流（communication）**，前馈是每个位置自己的**计算（computation）**。

```tensors 图解：每个位置各自「扩宽 → ReLU → 压回」（n_embd=2 → 8 → 2；只画一段，T=3）
T, n_embd = 3, 2
net = nn.Sequential(nn.Linear(n_embd, 4 * n_embd), nn.ReLU(), nn.Linear(4 * n_embd, n_embd))
dims('x', 'T C'); dims('h', 'T 4C'); dims('out', 'T C'); dims('out2', 'T C'); dims('x2', 'T C')
x = torch.randn(T, n_embd)               #: 输入：3 个位置 × 2 维
h = net[0](x)                            #: 第一层 Linear：每个位置 2 维 → 8 维（4 倍宽）
before('h'); hl('h', h < 0)
h = net[1](h)                            #: ReLU：负数（橙色，加框）全部变成 0，正数原样保留
out = net[2](h)                          #: 第二层 Linear：8 维压回 2 维，形状和输入一样。真实代码最后还有一个 Dropout
x2 = x.clone()
x2[0] += 1.0
hl('x2', S[0]); hl('out2', S[0]); show('x2')
out2 = net(x2)                           #: 只改第 0 个位置的输入再算一遍：只有第 0 行的输出变了，第 1、2 行和上面完全一样
```

<div class="predict">

**先猜一猜**：`n_embd=32` 时，这一层有多少个参数？原版 `n_embd=384` 时呢？

<details><summary>想好了再点开</summary>

本课：32×128 + 128 + 128×32 + 32 = **8352**。原版：384×1536 + 1536 + 1536×384 + 384 = **1,181,568**，每个 Block 的参数大约三分之二都在前馈层。

</details>
</div>

## 你的任务

在 `__init__` 里用 `nn.Sequential` 建出 `self.net`。

<details><summary>提示</summary>

```
nn.Sequential(
    nn.Linear(n_embd, 4 * n_embd),
    nn.ReLU(),
    ...
)
```

`nn.Sequential` 把几层按顺序串起来，调用它就是依次过每一层。

</details>

## 通过之后

输出最后一行验证了「逐位置」：改第 0 个位置的输入，其他位置的输出不变。位置之间的交流只发生在注意力里。
