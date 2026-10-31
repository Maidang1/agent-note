---
title: forward 后半段：穿过 Block，变成打分和 loss
module: m5-gpt
goal: 写完 GPT 的 forward，让它和 Bigram 有完全相同的「接口」。
refs: gpt.py:167-179
---

## 为什么后半段这么短

所有复杂的事情都封装在 Block 里了。forward 剩下的只是把向量送过去、再翻译回打分：

```
x       (B,T,C)    ← 上一课的 tok_emb + pos_emb
blocks  (B,T,C)    ← n_layer 个 Block，形状始终不变
ln_f    (B,T,C)
lm_head (B,T,65)   ← 每个位置对下一个字符的 65 个打分
```

`self.blocks` 是 `nn.Sequential`，调用一次就依次过完所有 Block。因为每个 Block 输入输出形状相同，叠多少层都不用改代码。

后面算 loss 的部分和 Bigram **一字不差**。这是有意的：GPT 和 Bigram 的接口完全一样（输入 idx 和可选的 targets，返回 logits 和 loss），所以第 10–12 课写的训练循环、`estimate_loss`、`generate` 都能直接用。

<div class="predict">

**先猜一猜**：Bigram 的 logits 只取决于当前字符。GPT 的 logits[b, t] 取决于哪些输入？

<details><summary>想好了再点开</summary>

取决于 `idx[b, 0..t]`：同一段里第 t 个及之前的所有字符，以及它们的位置。每个 Head 都只看过去，叠多少层也不会看到未来，也不会看到别的段。

</details>
</div>

## 你的任务

1. 补全 blocks、ln_f、lm_head 三行。
2. 补全 loss 分支（照第 8 课写）。

<details><summary>提示</summary>

```
if targets is None:
    loss = None
else:
    B, T, C = logits.shape
    ...
```

</details>

## 通过之后

GPT 的前向传播写完了。最后一块：生成时上文会越来越长，而位置嵌入只有 block_size 行。
