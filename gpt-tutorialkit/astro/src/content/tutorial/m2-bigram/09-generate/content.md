---
type: lesson
title: "generate：一个字符一个字符往外写"
---

## 为什么一次只写一个字符

模型只会做一件事：看上文，给下一个字符打分。想写一整段，就把这件事循环起来：

1. 对当前上文 `idx` 做 forward，得到每个位置的打分 `(B, T, C)`
2. 只要<strong>最后一个位置</strong>的打分 `(B, C)`——它才是对「下一个字符」的猜测
3. softmax 变成概率
4. 按概率<strong>抽</strong>一个字符（不是直接取最大的）
5. 接到 `idx` 末尾，回到第 1 步

这叫<strong>自回归</strong>：每一步的输出成为下一步的输入。ChatGPT 生成回答也是这样一个 token 一个 token 往外蹦的。

为什么要抽样而不总选最高分？总选最高分（greedy）会让文字很快陷入重复循环；按概率抽样能写出更多样的内容。

<figure class="tfig"><figcaption class="tfig-title">图解：生成一个字符时，张量怎么变（B=1，上文 &quot;he&quot;，4 个候选字符）</figcaption><ol class="tfig-steps"><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">1</span><p class="tfig-cap">当前上文 <code>&quot;he&quot;</code>，形状 <code>(1, 2)</code></p></div><pre class="tfig-code"><code>idx = torch.tensor([[1, 0]])</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>idx</code><span class="tfig-shape">(B=1, T=2)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(3, auto)"><span class="tc-corner">B↓ T→</span><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h tc-rh">0</span><span class="tc tc-char">1<small>h</small></span><span class="tc tc-char">0<small>e</small></span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">2</span><p class="tfig-cap">forward：每个位置都有 4 个打分，<code>(1, 2, 4)</code></p></div><pre class="tfig-code"><code>logits, loss = table(idx), None</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>logits</code><span class="tfig-shape">(B=1, T=2, C=4)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tfig-panel-title">B=0</div><div class="tgrid" style="grid-template-columns:repeat(5, auto)"><span class="tc-corner">T↓ C→</span><span class="tc-h">e</span><span class="tc-h">h</span><span class="tc-h">l</span><span class="tc-h">o</span><span class="tc-h tc-rh">h</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 42%, transparent)">0.63</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 7%, transparent)">0.03</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 61%, transparent)">0.95</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 10%, transparent)">0.06</span><span class="tc-h tc-rh">e</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 16%, transparent)">0.18</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 10%, transparent)">−0.07</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 27%, transparent)">−0.36</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 59%, transparent)">−0.92</span></div></div></div></div><div class="tfig-val tfig-scalar"><code>loss = None</code></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">3</span><p class="tfig-cap">只要最后一个位置（加框的那行）→ <code>(1, 4)</code>：对「<code>e</code> 后面是什么」的打分</p></div><pre class="tfig-code"><code>logits = logits[:, -1, :]</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>logits（这一步之前）</code><span class="tfig-shape">(B=1, T=2, C=4)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tfig-panel-title">B=0</div><div class="tgrid" style="grid-template-columns:repeat(5, auto)"><span class="tc-corner">T↓ C→</span><span class="tc-h">e</span><span class="tc-h">h</span><span class="tc-h">l</span><span class="tc-h">o</span><span class="tc-h tc-rh">h</span><span class="tc tc-dim" style="background:color-mix(in srgb, var(--tfig-pos) 42%, transparent)">0.63</span><span class="tc tc-dim" style="background:color-mix(in srgb, var(--tfig-pos) 7%, transparent)">0.03</span><span class="tc tc-dim" style="background:color-mix(in srgb, var(--tfig-pos) 61%, transparent)">0.95</span><span class="tc tc-dim" style="background:color-mix(in srgb, var(--tfig-pos) 10%, transparent)">0.06</span><span class="tc-h tc-rh">e</span><span class="tc tc-hl" style="background:color-mix(in srgb, var(--tfig-pos) 16%, transparent)">0.18</span><span class="tc tc-hl" style="background:color-mix(in srgb, var(--tfig-neg) 10%, transparent)">−0.07</span><span class="tc tc-hl" style="background:color-mix(in srgb, var(--tfig-neg) 27%, transparent)">−0.36</span><span class="tc tc-hl" style="background:color-mix(in srgb, var(--tfig-neg) 59%, transparent)">−0.92</span></div></div></div></div><div class="tfig-val"><div class="tfig-name"><code>logits</code><span class="tfig-shape">(B=1, C=4)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(5, auto)"><span class="tc-corner">B↓ C→</span><span class="tc-h">e</span><span class="tc-h">h</span><span class="tc-h">l</span><span class="tc-h">o</span><span class="tc-h tc-rh">h</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 17%, transparent)">0.18</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 10%, transparent)">−0.07</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 28%, transparent)">−0.36</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-neg) 61%, transparent)">−0.92</span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">4</span><p class="tfig-cap">打分 → 概率，每行加起来是 1</p></div><pre class="tfig-code"><code>probs = F.softmax(logits, dim=-1)</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>probs</code><span class="tfig-shape">(B=1, C=4)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(5, auto)"><span class="tc-corner">B↓ C→</span><span class="tc-h">e</span><span class="tc-h">h</span><span class="tc-h">l</span><span class="tc-h">o</span><span class="tc-h tc-rh">0</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 61%, transparent)">0.37</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 49%, transparent)">0.29</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 38%, transparent)">0.22</span><span class="tc" style="background:color-mix(in srgb, var(--tfig-pos) 24%, transparent)">0.12</span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">5</span><p class="tfig-cap">按概率<strong>抽</strong>一个编号 → <code>(1, 1)</code></p></div><pre class="tfig-code"><code>idx_next = torch.multinomial(probs, num_samples=1)</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>idx_next</code><span class="tfig-shape">(B=1, 1=1)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(2, auto)"><span class="tc-corner">B↓ 1→</span><span class="tc-h">0</span><span class="tc-h tc-rh">0</span><span class="tc tc-char">1<small>h</small></span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">6</span><p class="tfig-cap">沿时间维接到末尾 → <code>(1, 3)</code>。下一轮拿它再来一遍</p></div><pre class="tfig-code"><code>idx = torch.cat((idx, idx_next), dim=1)</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>idx</code><span class="tfig-shape">(B=1, T=3)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(4, auto)"><span class="tc-corner">B↓ T→</span><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h tc-rh">0</span><span class="tc tc-char">1<small>h</small></span><span class="tc tc-char">0<small>e</small></span><span class="tc tc-char">1<small>h</small></span></div></div></div></div></div></li></ol></figure>

<div class="predict">

<strong>先猜一猜</strong>：模型还没训练，生成的 200 个字符会是什么样子？

<details><summary>想好了再点开</summary>

完全的乱码，各种大小写和标点随机混在一起。表里全是随机数，每个字符都差不多可能。下一个模块训练之后再生成，你会看到它开始有点「像英文」。

</details>
</div>

## 你的任务

补全 `generate` 循环体的 5 行。

<details><summary>提示 1：取最后一个位置</summary>

`logits[:, -1, :]`：所有段、最后一个时间步、全部 65 个打分。

</details>

<details><summary>提示 2：抽样与拼接</summary>

`torch.multinomial(probs, num_samples=1)` 每行按概率抽一个下标，形状 `(B, 1)`。`torch.cat((idx, idx_next), dim=1)` 沿时间维拼接。

</details>

## 通过之后

Bigram 每次都把<strong>整段</strong>上文喂给 forward，但只用了最后一个字符，前面的计算全浪费了。GPT 的 generate 几乎一样，只多一步：上文太长时截掉前面，只保留最近 `block_size` 个（第 25 课）。
