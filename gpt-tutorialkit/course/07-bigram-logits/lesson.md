---
title: forward：一次查表得到所有位置的 logits
module: m2-bigram
goal: 写出 Bigram 的 forward，看懂 (B, T) 怎么变成 (B, T, C)。
refs: bigram.py:68-71
---

## 为什么这么简单

`forward` 定义「输入 → 输出」的计算。调用 `model(xb)` 时 PyTorch 会替你调用 `forward(xb)`。

Bigram 的 forward 只有一步：把 `(B, T)` 的编号整体交给查表层。`nn.Embedding` 会对每一个编号各取一行，所以形状多出最后一维：

```
idx    (B, T)          每个位置一个字符编号
logits (B, T, C)       每个位置 C=65 个打分：对「下一个字符」的猜测
```

**logits** 是还没转成概率的原始分数，可正可负，越大表示越可能。下一课用 softmax 把它们变成概率。

```tensors 图解：用一个只有 4 个字符的小字符表，看 (B, T) 怎么变成 (B, T, C)
voc = ['e', 'h', 'l', 'o']
table = nn.Embedding(4, 4)
dims('W', 'V C'); labels('W', rows=voc, cols=voc)
W = table.weight          #: 打分表 `W`：一行对应一个「上一个字符」，一列对应一个「下一个字符」候选。真实的表是 65 × 65，这里缩成 4 × 4
dims('idx', 'B T'); as_chars('idx', voc)
idx = torch.tensor([[1, 0, 2], [0, 2, 2]])   #: 输入 2 段、每段 3 个字符：`"hel"` 和 `"ell"`。格子里大字是编号，小字是对应字符
dims('logits', 'B T C'); labels('logits', rows=['hel', 'ell'], cols=voc)
logits = table(idx)       #: 查表：每个编号**原样取出 W 的那一行**放到它的位置上。每个格子从一个数变成一行 4 个数，于是形状多出最后一维 C。左边的行标签是这个位置的输入字符
hl('W', S[2]); hl('logits', S[[0, 1, 1], [2, 1, 2]]); show('W', 'logits')
same = torch.equal(logits[1, 2], W[2])   #: 三个 `l`（编号 2）所在的位置，拿到的都是 W 的第 2 行，一模一样
```

注意 Bigram 的局限：同一个字符，不论前面写了什么，查到的都是同一行。`"hel"` 和 `"hell"` 都以 `l` 结尾，它给出的猜测完全一样。这就是后面要用注意力解决的问题。

<div class="predict">

**先猜一猜**：`xb` 的形状是 `(4, 8)`，`logits` 的形状是什么？一共包含多少个打分？

<details><summary>想好了再点开</summary>

`(4, 8, 65)`，共 **2080** 个打分：4 段 × 8 个位置 × 65 个候选。

</details>
</div>

## 你的任务

补全 `forward` 里的 `logits`。

<details><summary>提示</summary>

`self.token_embedding_table(idx)`——查表层可以直接吃一整个二维张量。

</details>

## 通过之后

输出最后一行验证了「同一个字符 → 同一行」。现在 `targets` 参数还没用上；下一课在它不为 None 时算 loss。
