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
