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

<figure class="tfig"><figcaption class="tfig-title">图解：一个 Block 的参数都在哪（n_embd = C = 4，2 个头）</figcaption><ol class="tfig-steps"><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">1</span><p class="tfig-cap">四个部件各有多少参数：3C²=48、C²+C=20、8C²+5C=148、4C=16。前馈层占了一大半</p></div><pre class="tfig-code"><code>parts = torch.tensor([count(*qkv), count(proj), count(ffwd), count(ln1, ln2)])</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>parts</code><span class="tfig-shape">(4,)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(4, auto)"><span class="tc-h">q,k,v</span><span class="tc-h">proj</span><span class="tc-h">ffwd</span><span class="tc-h">ln×2</span><span class="tc">48</span><span class="tc">20</span><span class="tc">148</span><span class="tc">16</span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">2</span><p class="tfig-cap">合计</p></div><pre class="tfig-code"><code>total = parts.sum().item()</code></pre><div class="tfig-vals"><div class="tfig-val tfig-scalar"><code>total = 232</code></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">3</span><p class="tfig-cap">用公式 12C² + 10C 算，结果一样</p></div><pre class="tfig-code"><code>formula = 12 * C**2 + 10 * C</code></pre><div class="tfig-vals"><div class="tfig-val tfig-scalar"><code>formula = 232</code></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">4</span><p class="tfig-cap">前馈第一层的权重 <code>(4C, C)</code>：它和第二层 <code>(C, 4C)</code> 就是 8C² 的来源</p></div><pre class="tfig-code"><code>W1 = ffwd[0].weight</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>W1</code><span class="tfig-shape">(4C=16, C=4)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(5, auto)"><span class="tc-corner">4C↓ C→</span><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h">3</span><span class="tc-h tc-rh">0</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 26%, transparent)">0.18</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 17%, transparent)">−0.10</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 57%, transparent)">−0.46</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 12%, transparent)">−0.05</span><span class="tc-h tc-rh">1</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 27%, transparent)">−0.19</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 49%, transparent)">0.38</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 30%, transparent)">−0.21</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 32%, transparent)">−0.24</span><span class="tc-h tc-rh">2</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 28%, transparent)">0.20</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 42%, transparent)">−0.33</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 15%, transparent)">−0.08</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 10%, transparent)">−0.03</span><span class="tc-h tc-rh">3</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 57%, transparent)">0.46</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 12%, transparent)">0.05</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 10%, transparent)">−0.04</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 22%, transparent)">−0.14</span><span class="tc-h tc-rh">4</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 33%, transparent)">0.24</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 17%, transparent)">0.09</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 9%, transparent)">0.02</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 51%, transparent)">−0.40</span><span class="tc-h tc-rh">5</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 59%, transparent)">−0.48</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 11%, transparent)">0.04</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 54%, transparent)">−0.43</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 45%, transparent)">0.35</span><span class="tc-h tc-rh">⋮</span><span class="tc tc-gap">⋮</span><span class="tc tc-gap">⋮</span><span class="tc tc-gap">⋮</span><span class="tc tc-gap">⋮</span><span class="tc-h tc-rh">15</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 48%, transparent)">0.38</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 41%, transparent)">0.31</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 34%, transparent)">0.25</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 30%, transparent)">−0.22</span></div></div></div></div></div></li></ol></figure>

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
