---
type: lesson
title: "字符表：模型能「说」哪些字"
---

## 为什么需要它

模型每一步的输出是：<strong>对字符表里每一个字符打一个分</strong>。所以先要知道字符表里有哪些字符。

这门课用最简单的方案——一个字符就是一个单位（token）。整本书出现过的所有不同字符，排好序，就是字符表；它的长度 `vocab_size` 决定了模型最后一层要输出多少个分数。

为什么要排序？Python 的 `set` 没有固定顺序，不同进程里迭代顺序可能不同。排序后，同一个字符在任何时候都拿到同一个位置，下一课的编号才稳定。

<figure class="tfig"><figcaption class="tfig-title">图解：拿一小段文字走一遍</figcaption><ol class="tfig-steps"><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">1</span><p class="tfig-cap">原文（真实的是整本莎士比亚，这里只用 11 个字符）</p></div><pre class="tfig-code"><code>text = &quot;hello world&quot;</code></pre><div class="tfig-vals"><div class="tfig-val tfig-scalar"><code>text = &#x27;hello world&#x27;</code></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">2</span><p class="tfig-cap"><code>set</code> 去重、<code>sorted</code> 排序：重复的 <code>l</code>、<code>o</code> 只留一个，空格排在最前面</p></div><pre class="tfig-code"><code>chars = sorted(list(set(text)))</code></pre><div class="tfig-vals"><div class="tfig-val tfig-scalar"><code>chars = [&#x27; &#x27;, &#x27;d&#x27;, &#x27;e&#x27;, &#x27;h&#x27;, &#x27;l&#x27;, &#x27;o&#x27;, &#x27;r&#x27;, &#x27;w&#x27;]</code></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">3</span><p class="tfig-cap">字符表长度：模型每一步要给这么多个候选打分</p></div><pre class="tfig-code"><code>vocab_size = len(chars)</code></pre><div class="tfig-vals"><div class="tfig-val tfig-scalar"><code>vocab_size = 8</code></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">4</span><p class="tfig-cap">把字符表画成一排格子：第 i 格放第 i 个字符（小字，␣ 是空格）。下一课它的格子号就是编号</p></div><pre class="tfig-code"><code>ids = torch.arange(vocab_size)</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>ids</code><span class="tfig-shape">(V=8)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(8, auto)"><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h">3</span><span class="tc-h">4</span><span class="tc-h">5</span><span class="tc-h">6</span><span class="tc-h">7</span><span class="tc tc-char">0<small>␣</small></span><span class="tc tc-char">1<small>d</small></span><span class="tc tc-char">2<small>e</small></span><span class="tc tc-char">3<small>h</small></span><span class="tc tc-char">4<small>l</small></span><span class="tc tc-char">5<small>o</small></span><span class="tc tc-char">6<small>r</small></span><span class="tc tc-char">7<small>w</small></span></div></div></div></div></div></li></ol></figure>

<div class="predict">

<strong>先猜一猜</strong>：莎士比亚全集（只含英文、标点、空格、换行）大约有多少种不同字符？

<details><summary>想好了再点开</summary>

<strong>65 种</strong>：26 个大写 + 26 个小写 + 空格、换行、`!$&',-.3:;?` 等。字符表这么小，是因为我们按字符切分。GPT-2 用的是子词切分（BPE），字符表有 50257 个。

</details>
</div>

## 你的任务

1. 用 `set` 去重、`sorted` 排序，得到 `chars`。
2. `vocab_size = len(chars)`。

<details><summary>提示</summary>

`sorted(set("hello"))` 得到 `['e', 'h', 'l', 'o']`。原版写成 `sorted(list(set(text)))`，效果一样。

</details>

## 通过之后

看看输出里字符表的第一个字符：它是换行符 `\n`，第二个是空格。排序按 Unicode 编码，所以标点和数字排在字母前面，大写排在小写前面。
