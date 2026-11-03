---
type: lesson
title: "张量与训练 / 验证切分"
---

## 为什么需要它

<strong>张量（tensor）</strong>是 PyTorch 装数字的容器，可以理解成带形状、能放到 GPU 上批量计算的多维数组。整本书编码后是一个长约 111 万的一维张量。

`dtype=torch.long` 表示 64 位整数。字符编号是类别标签，不是连续的数值，后面查表（`nn.Embedding`）和算交叉熵（`F.cross_entropy`）都要求它是 long。

再切一刀：<strong>前 90% 训练，后 10% 验证</strong>。训练只用前一份；验证集模型从没见过，用来检查它是学到了规律还是在背书。训练 loss 一直降、验证 loss 却开始升，就是<strong>过拟合</strong>。

<figure class="tfig"><figcaption class="tfig-title">图解：一维张量和切片（用 14 个字符代替 111 万个）</figcaption><ol class="tfig-steps"><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">1</span><p class="tfig-cap">整段文字编码成一维的 long 张量，形状 <code>(N,)</code></p></div><pre class="tfig-code"><code>data = torch.tensor([stoi[c] for c in text], dtype=torch.long)</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>data</code><span class="tfig-shape">(N=14)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(14, auto)"><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h">3</span><span class="tc-h">4</span><span class="tc-h">5</span><span class="tc-h">6</span><span class="tc-h">7</span><span class="tc-h">8</span><span class="tc-h">9</span><span class="tc-h">10</span><span class="tc-h">11</span><span class="tc-h">12</span><span class="tc-h">13</span><span class="tc tc-char">3<small>F</small></span><span class="tc tc-char">5<small>i</small></span><span class="tc tc-char">7<small>r</small></span><span class="tc tc-char">8<small>s</small></span><span class="tc tc-char">9<small>t</small></span><span class="tc tc-char">0<small>␣</small></span><span class="tc tc-char">2<small>C</small></span><span class="tc tc-char">5<small>i</small></span><span class="tc tc-char">9<small>t</small></span><span class="tc tc-char">5<small>i</small></span><span class="tc tc-char">10<small>z</small></span><span class="tc tc-char">4<small>e</small></span><span class="tc tc-char">6<small>n</small></span><span class="tc tc-char">1<small>:</small></span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">2</span><p class="tfig-cap">前 90% 的长度，取整</p></div><pre class="tfig-code"><code>n = int(0.9*len(data))</code></pre><div class="tfig-vals"><div class="tfig-val tfig-scalar"><code>n = 12</code></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">3</span><p class="tfig-cap"><code>data[:n]</code>：前 n 个（加框）当训练集</p></div><pre class="tfig-code"><code>train_data = data[:n]</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>train_data</code><span class="tfig-shape">(12,)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(12, auto)"><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h">3</span><span class="tc-h">4</span><span class="tc-h">5</span><span class="tc-h">6</span><span class="tc-h">7</span><span class="tc-h">8</span><span class="tc-h">9</span><span class="tc-h">10</span><span class="tc-h">11</span><span class="tc">3</span><span class="tc">5</span><span class="tc">7</span><span class="tc">8</span><span class="tc">9</span><span class="tc">0</span><span class="tc">2</span><span class="tc">5</span><span class="tc">9</span><span class="tc">5</span><span class="tc">10</span><span class="tc">4</span></div></div></div></div><div class="tfig-val"><div class="tfig-name"><code>data</code><span class="tfig-shape">(N=14)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(14, auto)"><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h">3</span><span class="tc-h">4</span><span class="tc-h">5</span><span class="tc-h">6</span><span class="tc-h">7</span><span class="tc-h">8</span><span class="tc-h">9</span><span class="tc-h">10</span><span class="tc-h">11</span><span class="tc-h">12</span><span class="tc-h">13</span><span class="tc tc-char tc-hl">3<small>F</small></span><span class="tc tc-char tc-hl">5<small>i</small></span><span class="tc tc-char tc-hl">7<small>r</small></span><span class="tc tc-char tc-hl">8<small>s</small></span><span class="tc tc-char tc-hl">9<small>t</small></span><span class="tc tc-char tc-hl">0<small>␣</small></span><span class="tc tc-char tc-hl">2<small>C</small></span><span class="tc tc-char tc-hl">5<small>i</small></span><span class="tc tc-char tc-hl">9<small>t</small></span><span class="tc tc-char tc-hl">5<small>i</small></span><span class="tc tc-char tc-hl">10<small>z</small></span><span class="tc tc-char tc-hl">4<small>e</small></span><span class="tc tc-char tc-dim">6<small>n</small></span><span class="tc tc-char tc-dim">1<small>:</small></span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">4</span><p class="tfig-cap"><code>data[n:]</code>：剩下的一整块当验证集，训练时模型从不看它</p></div><pre class="tfig-code"><code>val_data = data[n:]</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>val_data</code><span class="tfig-shape">(2,)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(2, auto)"><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc">6</span><span class="tc">1</span></div></div></div></div><div class="tfig-val"><div class="tfig-name"><code>data</code><span class="tfig-shape">(N=14)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(14, auto)"><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h">3</span><span class="tc-h">4</span><span class="tc-h">5</span><span class="tc-h">6</span><span class="tc-h">7</span><span class="tc-h">8</span><span class="tc-h">9</span><span class="tc-h">10</span><span class="tc-h">11</span><span class="tc-h">12</span><span class="tc-h">13</span><span class="tc tc-char tc-dim">3<small>F</small></span><span class="tc tc-char tc-dim">5<small>i</small></span><span class="tc tc-char tc-dim">7<small>r</small></span><span class="tc tc-char tc-dim">8<small>s</small></span><span class="tc tc-char tc-dim">9<small>t</small></span><span class="tc tc-char tc-dim">0<small>␣</small></span><span class="tc tc-char tc-dim">2<small>C</small></span><span class="tc tc-char tc-dim">5<small>i</small></span><span class="tc tc-char tc-dim">9<small>t</small></span><span class="tc tc-char tc-dim">5<small>i</small></span><span class="tc tc-char tc-dim">10<small>z</small></span><span class="tc tc-char tc-dim">4<small>e</small></span><span class="tc tc-char tc-hl">6<small>n</small></span><span class="tc tc-char tc-hl">1<small>:</small></span></div></div></div></div></div></li></ol></figure>

<div class="predict">

<strong>先猜一猜</strong>：为什么直接按位置切，而不是随机挑 10% 的字符当验证集？

<details><summary>想好了再点开</summary>

模型学的是<strong>连续文字</strong>里的规律。随机挑单个字符，验证集的字符前后文全都在训练集里，等于泄题。整块切开，验证集才是一段模型真正没读过的文字。

</details>
</div>

## 你的任务

1. 用 `torch.tensor(..., dtype=torch.long)` 把 `encode(text)` 变成张量 `data`。
2. 算出 `n`，切出 `train_data` 和 `val_data`。

<details><summary>提示</summary>

`int(0.9 * len(data))`；切片 `data[:n]` 和 `data[n:]`。

</details>

## 通过之后

输出里 `data.shape` 是 `torch.Size([1115394])`。张量的 `.shape` 你会天天看：下一课开始，它就从一维变成了二维 `(B, T)`。
