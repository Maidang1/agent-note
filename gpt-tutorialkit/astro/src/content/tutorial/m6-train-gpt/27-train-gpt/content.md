---
type: lesson
title: "训练你的 GPT"
---

## 为什么还要再写一遍

和第 12 课几乎一样，这是有意的：GPT 和 Bigram 接口相同，训练循环一个字都不用为模型改。唯一的区别在评估条件：

```python
if iter % eval_interval == 0 or iter == max_iters - 1:
```

GPT 版本<strong>最后一步也评估一次</strong>，这样总能看到训练结束时的成绩。

本课配置：`block_size=32`、`n_embd=64`、3 层、学习率 `1e-3`，约 16 万参数，1000 步。比原版小很多，但上下文从 8 扩到 32，模型能看到的上文足够跨过一个单词了。

<figure class="tfig"><figcaption class="tfig-title">图解：哪些步会评估（max_iters=12, eval_interval=5）</figcaption><ol class="tfig-steps"><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">1</span><p class="tfig-cap">第 0 到 11 步</p></div><pre class="tfig-code"><code>iters = torch.arange(max_iters)</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>iters</code><span class="tfig-shape">(iter=12)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(12, auto)"><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h">3</span><span class="tc-h">4</span><span class="tc-h">5</span><span class="tc-h">6</span><span class="tc-h">7</span><span class="tc-h">8</span><span class="tc-h">9</span><span class="tc-h">10</span><span class="tc-h">11</span><span class="tc">0</span><span class="tc">1</span><span class="tc">2</span><span class="tc">3</span><span class="tc">4</span><span class="tc">5</span><span class="tc">6</span><span class="tc">7</span><span class="tc">8</span><span class="tc">9</span><span class="tc">10</span><span class="tc">11</span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">2</span><p class="tfig-cap">第 12 课的条件：只在 0、5、10 步评估（T），最后一步 11 不评估</p></div><pre class="tfig-code"><code>bigram_eval = iters % eval_interval == 0</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>bigram_eval</code><span class="tfig-shape">(iter=12)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(12, auto)"><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h">3</span><span class="tc-h">4</span><span class="tc-h">5</span><span class="tc-h">6</span><span class="tc-h">7</span><span class="tc-h">8</span><span class="tc-h">9</span><span class="tc-h">10</span><span class="tc-h">11</span><span class="tc tc-on">T</span><span class="tc">F</span><span class="tc">F</span><span class="tc">F</span><span class="tc">F</span><span class="tc tc-on">T</span><span class="tc">F</span><span class="tc">F</span><span class="tc">F</span><span class="tc">F</span><span class="tc tc-on">T</span><span class="tc">F</span></div></div></div></div></div></li><li class="tfig-step"><div class="tfig-head"><span class="tfig-num">3</span><p class="tfig-cap">GPT 版多了 <code>or iter == max_iters - 1</code>：最后一步也评估，总能看到最终成绩</p></div><pre class="tfig-code"><code>gpt_eval = (iters % eval_interval == 0) | (iters == max_iters - 1)</code></pre><div class="tfig-vals"><div class="tfig-val"><div class="tfig-name"><code>gpt_eval</code><span class="tfig-shape">(iter=12)</span></div><div class="tfig-panels"><div class="tfig-panel"><div class="tgrid" style="grid-template-columns:repeat(12, auto)"><span class="tc-h">0</span><span class="tc-h">1</span><span class="tc-h">2</span><span class="tc-h">3</span><span class="tc-h">4</span><span class="tc-h">5</span><span class="tc-h">6</span><span class="tc-h">7</span><span class="tc-h">8</span><span class="tc-h">9</span><span class="tc-h">10</span><span class="tc-h">11</span><span class="tc tc-on">T</span><span class="tc">F</span><span class="tc">F</span><span class="tc">F</span><span class="tc">F</span><span class="tc tc-on">T</span><span class="tc">F</span><span class="tc">F</span><span class="tc">F</span><span class="tc">F</span><span class="tc tc-on">T</span><span class="tc tc-on">T</span></div></div></div></div></div></li></ol></figure>

<div class="predict">

<strong>先猜一猜</strong>：第 12 课 Bigram 训了 3000 步，val loss 停在约 2.49。这个小 GPT 训 1000 步能到多少？

<details><summary>想好了再点开</summary>

约 <strong>2.17</strong>，而且还在往下降。区别全在「能看上文」：Bigram 只看 1 个字符，GPT 能看 32 个。原版 GPU 训 5000 步可以到 1.48，生成的文字已经很像莎士比亚了。

</details>
</div>

## 你的任务

补全训练循环：评估、抽数据、训练一步。

<details><summary>提示</summary>

照着第 12 课写，只改评估条件。训练一步就是第 10 课的四行。

</details>

## 通过之后

对比生成的文字和第 12 课：已经能拼出 `the`、`and`、`thou` 这样的短词，还有「角色名 + 冒号 + 换行」的剧本格式。训练越久、模型越大，就越像原文。
