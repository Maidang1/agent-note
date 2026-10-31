---
title: forward 第一步：字符向量 + 位置向量
module: m5-gpt
goal: 把 (B, T) 的编号变成 (B, T, C) 的向量，并理解加法里的广播。
refs: gpt.py:160-166
---

## 为什么是相加

每个位置的输入向量 = 「它是什么字符」+「它在第几个位置」：

```
tok_emb = token_embedding_table(idx)              (B, T, C)
pos_emb = position_embedding_table(arange(T))     (T, C)
x       = tok_emb + pos_emb                       (B, T, C)
```

`torch.arange(T)` 是 `[0, 1, ..., T-1]`，查表得到 T 个位置向量。它和 batch 无关，所以形状是 `(T, C)`。

`(B, T, C) + (T, C)` 能直接相加，靠的是**广播**：PyTorch 从最后一维开始对齐，`(T, C)` 被当成 `(1, T, C)`，再复制到 B 段上。每一段的第 t 个位置都加上同一个位置向量。

为什么相加而不是拼接？相加不增加宽度，后面所有层的形状不变；向量维度足够高时，模型可以学会把「字符信息」和「位置信息」放在不同的方向上，互不干扰。

`device=device` 让位置下标和模型在同一个设备上。在 GPU 上训练时，少了它会报「设备不一致」。

<div class="predict">

**先猜一猜**：输入 `"aaaa"`，四个位置的 `tok_emb` 一样吗？最终 logits 一样吗？

<details><summary>想好了再点开</summary>

`tok_emb` **完全一样**，都是 `a` 那一行。但加上位置向量后各不相同，而且位置 3 能通过注意力看到前面 3 个 a，所以 4 个位置的 logits 都**不同**。输出里可以验证。

</details>
</div>

## 你的任务

补全 `forward` 开头三行。

<details><summary>提示</summary>

`self.position_embedding_table(torch.arange(T, device=device))`。T 取自 `idx.shape`，不是 `block_size`：输入可能比 block_size 短。

</details>

## 通过之后

`x` 现在是 `(B, T, C)`，可以送进 Block 了。下一课写剩下的部分。
