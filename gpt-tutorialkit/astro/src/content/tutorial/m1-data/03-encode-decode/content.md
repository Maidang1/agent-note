---
type: lesson
title: "encode / decode：字符和整数互相翻译"
---

## 为什么需要它

神经网络只会算数字。我们给字符表里每个字符一个编号（它在 `chars` 里的下标），文字就变成了一串整数：

```
"hii" → [46, 47, 47]
```

编号只是<strong>标签</strong>，不代表大小或相似度：`a` 是 39、`b` 是 40，并不意味着它们意思接近。下一个模块里，模型会把每个编号换成一个可学习的向量，那才是「含义」开始出现的地方。

- <strong>encode</strong>：字符串 → 整数列表，训练前用。
- <strong>decode</strong>：整数列表 → 字符串，生成后把模型输出翻译回文字。

<figure class="tfig"><figcaption class="tfig-title">图解：编号就是字符在字符表里的位置</figcaption><ol class="tfig-steps"><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">1</span><p class="tfig-cap">上一课的小字符表：格子里大字是编号，小字是字符（␣ 是空格）</p></div><pre class="tfig-code"><code>ids = torch.arange(len(chars))</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>ids</code><span class="tfig-shape">(V=8)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(8, auto)"><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h">3</span><span class="tc-h">4</span><span class="tc-h">5</span><span class="tc-h">6</span><span class="tc-h">7</span><span class="tc tc-char">0<small>␣</small></span><span class="tc tc-char">1<small>d</small></span><span class="tc tc-char">2<small>e</small></span><span class="tc tc-char">3<small>h</small></span><span class="tc tc-char">4<small>l</small></span><span class="tc tc-char">5<small>o</small></span><span class="tc tc-char">6<small>r</small></span><span class="tc tc-char">7<small>w</small></span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">2</span><p class="tfig-cap"><code>stoi</code>：字符 → 编号，就是把上面这排格子「从小字查大字」</p></div><pre class="tfig-code"><code>stoi = { ch:i for i,ch in enumerate(chars) }</code></pre><div class="tfig-vals"><div class="tfig-val tfig-scalar"><code>stoi = {&#x27; &#x27;: 0, &#x27;d&#x27;: 1, &#x27;e&#x27;: 2, &#x27;h&#x27;: 3, &#x27;l&#x27;: 4, &#x27;o&#x27;: 5, &#x27;r&#x27;: 6, &#x27;w&#x27;: 7}</code></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">3</span><p class="tfig-cap"><code>itos</code>：反过来，编号 → 字符</p></div><pre class="tfig-code"><code>itos = { i:ch for i,ch in enumerate(chars) }</code></pre><div class="tfig-vals"><div class="tfig-val tfig-scalar"><code>itos = {0: &#x27; &#x27;, 1: &#x27;d&#x27;, 2: &#x27;e&#x27;, 3: &#x27;h&#x27;, 4: &#x27;l&#x27;, 5: &#x27;o&#x27;, 6: &#x27;r&#x27;, 7: &#x27;w&#x27;}</code></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">4</span><p class="tfig-cap">encode：逐个字符查 <code>stoi</code>，得到整数列表</p></div><pre class="tfig-code"><code>codes = encode(&quot;hello&quot;)</code></pre><div class="tfig-vals"><div class="tfig-val tfig-scalar"><code>codes = [3, 2, 4, 4, 5]</code></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">5</span><p class="tfig-cap">放进格子看：两个 <code>l</code> 是同一个编号</p></div><pre class="tfig-code"><code>t = torch.tensor(codes)</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>t</code><span class="tfig-shape">(T=5)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(5, auto)"><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h">3</span><span class="tc-h">4</span><span class="tc tc-char">3<small>h</small></span><span class="tc tc-char">2<small>e</small></span><span class="tc tc-char">4<small>l</small></span><span class="tc tc-char">4<small>l</small></span><span class="tc tc-char">5<small>o</small></span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">6</span><p class="tfig-cap">decode：逐个编号查 <code>itos</code>，拼回原来的字符串</p></div><pre class="tfig-code"><code>back = decode(codes)</code></pre><div class="tfig-vals"><div class="tfig-val tfig-scalar"><code>back = &#x27;hello&#x27;</code></div></div></li></ol></figure>

<div class="predict">

<strong>先猜一猜</strong>：`encode("A")` 和 `encode("a")` 哪个数更大？差多少？

<details><summary>想好了再点开</summary>

`a` 更大，差 <strong>26</strong>。字符表按 Unicode 排序，大写字母都排在小写前面，`A`=13、`a`=39，中间正好隔着 26 个大写字母。

</details>
</div>

## 你的任务

补全 `stoi`、`itos`、`encode`、`decode` 四行。

<details><summary>提示 1</summary>

`enumerate(chars)` 依次给出 `(0, '\n'), (1, ' '), ...`。dict 推导式写法：`{ k: v for ... in ... }`。

</details>

<details><summary>提示 2</summary>

`encode` 对字符串的每个字符查 `stoi`；`decode` 对列表里每个整数查 `itos`，再用 `''.join(...)` 拼起来。原版用的是 `lambda`，写成 `def` 也可以。

</details>

## 通过之后

这就是一个最简单的 <strong>tokenizer</strong>。真实的 GPT 用子词（BPE）切分：常见词是一个 token，生僻词拆成几块，序列更短、但字符表更大。这门课用字符级，好处是简单、不需要额外的库。
