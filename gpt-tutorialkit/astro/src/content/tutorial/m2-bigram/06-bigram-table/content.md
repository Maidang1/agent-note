---
type: lesson
title: "Bigram 模型：一张 65 × 65 的打分表"
---

## 为什么先做 Bigram

GPT 很复杂，但「输入字符编号 → 对下一个字符打分 → 算 loss → 训练 → 生成」这条流水线和模型复杂度无关。先用最简单的模型把流水线搭通，后面只需要把模型换成 GPT。

<strong>Bigram</strong> 只看<strong>上一个字符</strong>来猜下一个。所以它需要的全部知识就是一张表：

| 上一个字符 | 对下一个字符的打分（65 个） |
|---|---|
| `h` | `a`: 1.2, `e`: 2.8, `i`: 1.9, … |
| `q` | `u`: 5.0, 其他都很低 … |

一行 65 个分数，一共 65 行。这张表一开始是随机数，训练会把它调成「英文里 `q` 后面大概率是 `u`」这样的统计规律。

`nn.Embedding(num, dim)` 就是一张 `num × dim` 的可学习表，用整数编号去取对应的那一行。在 GPT 里它会用来存「每个字符的向量」；在 Bigram 里，那一行直接当作打分。

<figure class="tfig"><figcaption class="tfig-title">图解：nn.Embedding 就是一张表，用编号取一行（4 个字符的小字符表）</figcaption><ol class="tfig-steps"><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">1</span><p class="tfig-cap"><code>nn.Embedding(4, 4)</code> 建出一张 4 × 4 的随机表。第 i 行 = 上一个字符是第 i 个时，对下一个字符的 4 个打分</p></div><pre class="tfig-code"><code>W = table.weight</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>W</code><span class="tfig-shape">(V=4, C=4)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(5, auto)"><span class="tc-corner">V↓ C→</span><span class="tc-h">e</span><span class="tc-h">h</span><span class="tc-h">l</span><span class="tc-h">o</span><span class="tc-h tc-rh">e</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 12%, transparent)">0.18</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 8%, transparent)">−0.07</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 19%, transparent)">−0.36</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 39%, transparent)">−0.92</span><span class="tc-h tc-rh">h</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 28%, transparent)">0.63</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 7%, transparent)">0.03</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 40%, transparent)">0.95</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 8%, transparent)">0.06</span><span class="tc-h tc-rh">l</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 19%, transparent)">0.36</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 48%, transparent)">1.17</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 54%, transparent)">−1.35</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 24%, transparent)">−0.51</span><span class="tc-h tc-rh">o</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 14%, transparent)">0.24</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 15%, transparent)">−0.24</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 39%, transparent)">−0.92</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 61%, transparent)">1.54</span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">2</span><p class="tfig-cap">想查 <code>h</code>：它的编号是 1</p></div><pre class="tfig-code"><code>idx = torch.tensor([1])</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>idx</code><span class="tfig-shape">(N=1)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(1, auto)"><span class="tc-h">0</span><span class="tc tc-char">1<small>h</small></span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">3</span><p class="tfig-cap">查表 = 原样取出第 1 行（加框）。形状 <code>(1, 4)</code>：1 个输入，4 个打分</p></div><pre class="tfig-code"><code>row = table(idx)</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>row</code><span class="tfig-shape">(N=1, C=4)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(5, auto)"><span class="tc-corner">N↓ C→</span><span class="tc-h">e</span><span class="tc-h">h</span><span class="tc-h">l</span><span class="tc-h">o</span><span class="tc-h tc-rh">0</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 42%, transparent)">0.63</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 7%, transparent)">0.03</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 61%, transparent)">0.95</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 10%, transparent)">0.06</span></div></div></div></div><div class="tfig-val"><div class="tfig-name"><code>W</code><span class="tfig-shape">(V=4, C=4)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(5, auto)"><span class="tc-corner">V↓ C→</span><span class="tc-h">e</span><span class="tc-h">h</span><span class="tc-h">l</span><span class="tc-h">o</span><span class="tc-h tc-rh">e</span><span class="tc tc-dim" style="background:color-mix(in srgb, var(--tfig-pos) 12%, transparent)">0.18</span><span class="tc tc-dim" style="background:color-mix(in srgb, var(--tfig-neg) 8%, transparent)">−0.07</span><span class="tc tc-dim" style="background:color-mix(in srgb, var(--tfig-neg) 19%, transparent)">−0.36</span><span class="tc tc-dim" style="background:color-mix(in srgb, var(--tfig-neg) 39%, transparent)">−0.92</span><span class="tc-h tc-rh">h</span><span class="tc tc-hl" style="background:color-mix(in srgb, var(--tfig-pos) 28%, transparent)">0.63</span><span class="tc tc-hl" style="background:color-mix(in srgb, var(--tfig-pos) 7%, transparent)">0.03</span><span class="tc tc-hl" style="background:color-mix(in srgb, var(--tfig-pos) 40%, transparent)">0.95</span><span class="tc tc-hl" style="background:color-mix(in srgb, var(--tfig-pos) 8%, transparent)">0.06</span><span class="tc-h tc-rh">l</span><span class="tc tc-dim" style="background:color-mix(in srgb, var(--tfig-pos) 19%, transparent)">0.36</span><span class="tc tc-dim" style="background:color-mix(in srgb, var(--tfig-pos) 48%, transparent)">1.17</span><span class="tc tc-dim" style="background:color-mix(in srgb, var(--tfig-neg) 54%, transparent)">−1.35</span><span class="tc tc-dim" style="background:color-mix(in srgb, var(--tfig-neg) 24%, transparent)">−0.51</span><span class="tc-h tc-rh">o</span><span class="tc tc-dim" style="background:color-mix(in srgb, var(--tfig-pos) 14%, transparent)">0.24</span><span class="tc tc-dim" style="background:color-mix(in srgb, var(--tfig-neg) 15%, transparent)">−0.24</span><span class="tc tc-dim" style="background:color-mix(in srgb, var(--tfig-neg) 39%, transparent)">−0.92</span><span class="tc tc-dim" style="background:color-mix(in srgb, var(--tfig-pos) 61%, transparent)">1.54</span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">4</span><p class="tfig-cap">参数个数 = 表里的格子数 4 × 4。真实的表是 65 × 65 = 4225</p></div><pre class="tfig-code"><code>n_params = sum(p.numel() for p in table.parameters())</code></pre><div class="tfig-vals"><div class="tfig-val tfig-scalar"><code>n_params = 16</code></div></div></li></ol></figure>

<div class="predict">

<strong>先猜一猜</strong>：这个模型一共有多少个可学习的参数？

<details><summary>想好了再点开</summary>

<strong>4225</strong> = 65 × 65。整个模型就这一张表。作为对比，本课用的小 GPT 有约 3 万个参数，原版 GPT 有 1080 万个。

</details>
</div>

## 你的任务

1. 在 `__init__` 里建 `self.token_embedding_table`。
2. 数出 `n_params`。

<details><summary>提示 1</summary>

`nn.Embedding(vocab_size, vocab_size)`。属性名必须是 `token_embedding_table`，判题器会按名字把原版权重灌进来比对。

</details>

<details><summary>提示 2</summary>

`model.parameters()` 依次给出每个参数张量，`p.numel()` 是它的元素个数：`sum(p.numel() for p in model.parameters())`。

</details>

## 通过之后

`super().__init__()` 必须写在最前面：`nn.Module` 靠它登记子模块和参数，`model.parameters()` 才能找到这张表，优化器才能更新它。
