---
type: lesson
title: "前馈层：每个位置自己消化一下"
---

## 为什么注意力之后还要一层

注意力做的是<strong>加权平均</strong>，本质上是线性的混合：它把别的位置的信息搬过来，但不太会对这些信息做复杂的加工。前馈层给每个位置一个小型的两层神经网络，<strong>各位置独立、共用同一套权重</strong>：

```
(B,T,32) ─ Linear → (B,T,128) ─ ReLU ─ Linear → (B,T,32) ─ Dropout
```

- 中间扩到 4 倍宽，是原版 Transformer 论文的设定，给网络更多空间做计算。
- <strong>ReLU</strong>（`max(0, x)`）是非线性。没有它，两个 Linear 叠起来仍然等价于一个 Linear，多一层白搭。

Karpathy 的说法：注意力是位置之间的<strong>交流（communication）</strong>，前馈是每个位置自己的<strong>计算（computation）</strong>。

<div class="predict">

<strong>先猜一猜</strong>：`n_embd=32` 时，这一层有多少个参数？原版 `n_embd=384` 时呢？

<details><summary>想好了再点开</summary>

本课：32×128 + 128 + 128×32 + 32 = <strong>8352</strong>。原版：384×1536 + 1536 + 1536×384 + 384 = <strong>1,181,568</strong>，每个 Block 的参数大约三分之二都在前馈层。

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
