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
