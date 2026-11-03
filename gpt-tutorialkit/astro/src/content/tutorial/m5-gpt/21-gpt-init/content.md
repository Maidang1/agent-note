---
type: lesson
title: "GPT 的骨架：嵌入、Block 堆叠、输出头"
---

## 从 Bigram 到 GPT 改了什么

Bigram 用一张表直接把字符编号查成 65 个打分。GPT 在中间插入了「理解上文」的过程：

```
idx (B,T)
 ├─ token_embedding_table     字符编号 → 32 维向量（字符是什么）
 ├─ position_embedding_table  位置 0..T-1 → 32 维向量（字符在哪）
 ├─ blocks                    n_layer 个 Block 依次加工（第 20 课）
 ├─ ln_f                      最后再归一化一次
 └─ lm_head                   32 维向量 → 65 个打分
logits (B,T,65)
```

<strong>为什么需要位置嵌入？</strong> 注意力本身不知道顺序：把上文打乱，加权平均的结果一样。但「`th` 后面接 `e`」和「`ht` 后面接 `e`」完全不同。给每个位置也学一个向量、加到字符向量上，模型才分得清先后。

`nn.Sequential(*[Block(...) for _ in range(n_layer)])`：先用列表推导建出 n_layer 个 Block，`*` 把列表展开成参数，串成一条流水线。

最后一行 `self.apply(self._init_weights)` 会对每个子模块调用 `_init_weights`，下一课细讲。

<figure class="tfig"><figcaption class="tfig-title">图解：GPT 的三张「表」（vocab_size=5, n_embd=3, block_size=4）</figcaption><ol class="tfig-steps"><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">1</span><p class="tfig-cap"><code>token_embedding_table</code>：每个字符一行 C 维向量（「字符是什么」）。它不再是 Bigram 那张 V × V 的打分表</p></div><pre class="tfig-code"><code>tok_W = token_embedding_table.weight</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>tok_W</code><span class="tfig-shape">(V=5, C=3)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(4, auto)"><span class="tc-corner">V↓ C→</span><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h tc-rh">a</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 60%, transparent)">−2.03</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 61%, transparent)">−2.07</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 38%, transparent)">−1.21</span><span class="tc-h tc-rh">b</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 30%, transparent)">−0.91</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 39%, transparent)">−1.25</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 27%, transparent)">0.80</span><span class="tc-h tc-rh">c</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 12%, transparent)">−0.21</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 7%, transparent)">0.05</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 10%, transparent)">0.14</span><span class="tc-h tc-rh">d</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 16%, transparent)">−0.39</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 20%, transparent)">0.51</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 15%, transparent)">0.33</span><span class="tc-h tc-rh">e</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 23%, transparent)">0.63</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 21%, transparent)">0.58</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 7%, transparent)">−0.03</span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">2</span><p class="tfig-cap"><code>position_embedding_table</code>：每个位置一行（「字符在哪」）。只有 block_size=4 行，所以模型只认识位置 0..3</p></div><pre class="tfig-code"><code>pos_W = position_embedding_table.weight</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>pos_W</code><span class="tfig-shape">(block_size=4, C=3)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(4, auto)"><span class="tc-corner">block_size↓ C→</span><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h tc-rh">0</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 11%, transparent)">−0.17</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 42%, transparent)">−1.22</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 53%, transparent)">1.58</span><span class="tc-h tc-rh">1</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 22%, transparent)">0.54</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 40%, transparent)">1.16</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 26%, transparent)">0.69</span><span class="tc-h tc-rh">2</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 42%, transparent)">−1.23</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 26%, transparent)">0.69</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 41%, transparent)">1.18</span><span class="tc-h tc-rh">3</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 15%, transparent)">−0.29</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 52%, transparent)">1.54</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 61%, transparent)">1.86</span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">3</span><p class="tfig-cap"><code>lm_head</code>：把 C 维向量变回 V 个打分。Linear 的权重形状是 <code>(输出, 输入) = (V, C)</code>；中间的 blocks 和 ln_f 见第 20、24 课</p></div><pre class="tfig-code"><code>head_W = lm_head.weight</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>head_W</code><span class="tfig-shape">(V=5, C=3)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(4, auto)"><span class="tc-corner">V↓ C→</span><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h tc-rh">a</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 51%, transparent)">−0.44</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 26%, transparent)">0.20</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 54%, transparent)">−0.48</span><span class="tc-h tc-rh">b</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 18%, transparent)">0.12</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 15%, transparent)">−0.09</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 52%, transparent)">−0.46</span><span class="tc-h tc-rh">c</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 54%, transparent)">−0.48</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 10%, transparent)">0.04</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 53%, transparent)">0.47</span><span class="tc-h tc-rh">d</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 32%, transparent)">−0.26</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 61%, transparent)">−0.55</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 39%, transparent)">−0.33</span><span class="tc-h tc-rh">e</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 27%, transparent)">0.21</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 17%, transparent)">−0.11</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 59%, transparent)">−0.53</span></div></div></div></div></div></li></ol></figure>

<div class="predict">

<strong>先猜一猜</strong>：本课配置下 `position_embedding_table` 有多少行？如果生成时上文超过这个长度会怎样？

<details><summary>想好了再点开</summary>

<strong>block_size = 8 行</strong>，模型只认识位置 0..7。上文更长时，查位置 8 会越界报错，所以第 25 课的 generate 要先把上文截短。

</details>
</div>

## 你的任务

补全 `__init__` 里的五个部件，顺序和原版一致。

<details><summary>提示</summary>

两张嵌入表的形状是 `(vocab_size, n_embd)` 和 `(block_size, n_embd)`。`lm_head = nn.Linear(n_embd, vocab_size)`。

</details>

## 通过之后

看输出：大部分参数都在 `blocks` 里。原版 GPT 有 1080 万参数，本课只有 3 万，结构一模一样。
