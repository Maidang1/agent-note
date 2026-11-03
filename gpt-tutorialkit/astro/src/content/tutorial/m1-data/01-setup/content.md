---
type: lesson
title: "实验开关：超参数、设备与随机种子"
---

## 为什么先看这几行

gpt.py 开头十几行决定了整个实验的「尺寸」。后面每一课都会用到它们，先认个脸：

| 名字 | 管什么 | 原版 | 本课 |
|---|---|---|---|
| `batch_size` (B) | 每步同时练几段文字 | 64 | 4 |
| `block_size` (T) | 每段多长，也是模型最多能看到的上文 | 256 | 8 |
| `n_embd` (C) | 每个字符用多长的向量表示 | 384 | 32 |
| `n_head` | 注意力分几个头 | 6 | 4 |
| `n_layer` | 叠几层 Block | 6 | 2 |
| `dropout` | 训练时随机丢掉的比例 | 0.2 | 0.1 |
| `max_iters` | 训练多少步 | 5000 | 课里按需设置 |

这些是<strong>超参数</strong>：人在训练前定好的配置，不是模型学出来的。原版在 GPU 上要训 15 分钟，本课全部调小，让每次运行在 CPU 上几秒内完成——结构完全不变，只是规模小。

`B`、`T`、`C` 这三个字母会贯穿整门课：几乎所有张量的形状都是 `(B, T)` 或 `(B, T, C)`。

`torch.manual_seed(1337)` 固定随机数的起点。模型初始化、抽 batch、dropout、生成都要用随机数；种子固定，整次实验就能复现。判题器也靠它：用同一个种子跑你的代码和原版，结果应该一模一样。

<figure class="tfig"><figcaption class="tfig-title">图解：B、T、C 长什么样（缩小到 B=2, T=4, C=3）</figcaption><ol class="tfig-steps"><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">1</span><p class="tfig-cap">一批数据 <code>x</code> 的形状是 <code>(B, T)</code>：B 段文字，每段 T 个字符编号。B × T = 8 就是这一步要做的练习题数</p></div><pre class="tfig-code"><code>x = torch.randint(65, (2, 4))</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>x</code><span class="tfig-shape">(B=2, T=4)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(5, auto)"><span class="tc-corner">B↓ T→</span><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h">3</span><span class="tc-h tc-rh">0</span><span class="tc">35</span><span class="tc">22</span><span class="tc">7</span><span class="tc">50</span><span class="tc-h tc-rh">1</span><span class="tc">35</span><span class="tc">63</span><span class="tc">40</span><span class="tc">55</span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">2</span><p class="tfig-cap">进了模型以后，每个编号会变成一个 C 维向量，形状变成 <code>(B, T, C)</code>。三维张量按 B 拆成几块画，每块 T 行 C 列；后面所有课都这样画</p></div><pre class="tfig-code"><code>emb = torch.randn(2, 4, 3)</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>emb</code><span class="tfig-shape">(B=2, T=4, C=3)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tfig-panel-title">B=0</div><div class="tgrid" style="grid-template-columns:repeat(4, auto)"><span class="tc-corner">T↓ C→</span><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h tc-rh">0</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 23%, transparent)">−0.50</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 13%, transparent)">−0.20</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 59%, transparent)">−1.57</span><span class="tc-h tc-rh">1</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 43%, transparent)">−1.10</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 15%, transparent)">0.26</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 42%, transparent)">−1.07</span><span class="tc-h tc-rh">2</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 61%, transparent)">1.63</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 31%, transparent)">0.73</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 28%, transparent)">−0.66</span><span class="tc-h tc-rh">3</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 14%, transparent)">−0.25</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 40%, transparent)">1.01</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 10%, transparent)">0.12</span></div></div><div class="tfig-panel"><div class="tfig-panel-title">B=1</div><div class="tgrid" style="grid-template-columns:repeat(4, auto)"><span class="tc-corner">T↓ C→</span><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h tc-rh">0</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 11%, transparent)">0.16</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 44%, transparent)">1.13</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 45%, transparent)">−1.15</span><span class="tc-h tc-rh">1</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 16%, transparent)">−0.30</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 23%, transparent)">−0.51</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 37%, transparent)">−0.92</span><span class="tc-h tc-rh">2</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 24%, transparent)">0.55</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 56%, transparent)">−1.49</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 47%, transparent)">−1.21</span><span class="tc-h tc-rh">3</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 25%, transparent)">0.57</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 26%, transparent)">−0.60</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 29%, transparent)">−0.69</span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">3</span><p class="tfig-cap">先 <code>torch.manual_seed(1337)</code>，再抽一次随机数</p></div><pre class="tfig-code"><code>a = torch.randint(10, (2, 5))</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>a</code><span class="tfig-shape">(2, 5)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(6, auto)"><span class="tc-corner"></span><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h">3</span><span class="tc-h">4</span><span class="tc-h tc-rh">0</span><span class="tc">5</span><span class="tc">7</span><span class="tc">2</span><span class="tc">0</span><span class="tc">5</span><span class="tc-h tc-rh">1</span><span class="tc">3</span><span class="tc">5</span><span class="tc">0</span><span class="tc">4</span><span class="tc">0</span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">4</span><p class="tfig-cap">再设一次<strong>同一个</strong>种子、同样抽一次：每一格都和 <code>a</code> 相同</p></div><pre class="tfig-code"><code>b = torch.randint(10, (2, 5))</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>b</code><span class="tfig-shape">(2, 5)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(6, auto)"><span class="tc-corner"></span><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h">3</span><span class="tc-h">4</span><span class="tc-h tc-rh">0</span><span class="tc">5</span><span class="tc">7</span><span class="tc">2</span><span class="tc">0</span><span class="tc">5</span><span class="tc-h tc-rh">1</span><span class="tc">3</span><span class="tc">5</span><span class="tc">0</span><span class="tc">4</span><span class="tc">0</span></div></div></div></div></div></li></ol></figure>

<div class="predict">

<strong>先猜一猜</strong>：原版每步训练要做的练习题数量，是本课的多少倍？

<details><summary>想好了再点开</summary>

原版 64 × 256 = 16384，本课 4 × 8 = 32，相差 <strong>512 倍</strong>。再加上模型本身大 100 多倍，CPU 上跑原版配置会非常慢。

</details>
</div>

## 你的任务

1. 算出本课和原版每步的练习题数（`tokens_per_step`、`original_tokens_per_step`）。
2. 算出 `head_size`。
3. 让 `a` 和 `b` 相同：在第二次抽样前重设种子。

<details><summary>提示</summary>

超参数都在 `ns` 里，例如 `ns['batch_size']`。整除用 `//`，结果才是 `int`。第 3 题照抄上面那行 `torch.manual_seed(1337)`。

</details>

## 通过之后

- 右边输出的 `device` 是 `cpu` 还是 `cuda`？原版第 11 行就是在做这个判断。
- `load_original('gpt')` 已经替你执行了原版第 1–196 行（读数据、定义所有类），但没有执行最后的训练。之后每课都从它返回的 `ns` 里取东西用。
