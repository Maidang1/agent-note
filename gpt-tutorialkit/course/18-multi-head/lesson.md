---
title: 多头注意力：几个头并联，拼起来再投影
module: m4-attention
goal: 把多个 Head 并联成 MultiHeadAttention，理解为什么要「多头」。
refs: gpt.py:92-104
---

## 为什么要多个头

一个头只有一套 q / k / v，只能学一种「找什么」的规则。语言里同时有很多种关系：这个字母前面是不是元音？当前在单词的第几位？这一行是不是角色名？

**多头**就是几个独立的 Head 并排算，各自关注不同的东西，最后把结果拼起来：

```
x (B,T,32) ─┬─ Head 1 → (B,T,8) ─┐
            ├─ Head 2 → (B,T,8) ─┤
            ├─ Head 3 → (B,T,8) ─┼─ cat → (B,T,32) ─ proj ─ dropout → (B,T,32)
            └─ Head 4 → (B,T,8) ─┘
```

头数 × 头宽 = n_embd，所以总计算量和一个 32 宽的大头差不多，但能学 4 套不同的关注规则。

最后的 `proj` 是一个 `n_embd → n_embd` 的线性层，把几个头的结果混合起来。它也让这一层的输出回到残差通路上（第 20 课会讲）。

```tensors 图解：两个头并联，拼起来再投影（n_embd=4，2 个头，每头 head_size=2；只画一段，T=3）
T, n_embd, n_head, hs = 3, 4, 2, 2
tril = torch.tril(torch.ones(T, T))
def make_head():
    key, query, value = (nn.Linear(n_embd, hs, bias=False) for _ in range(3))
    def head(x):
        wei = query(x) @ key(x).transpose(-2, -1) * hs**-0.5
        wei = F.softmax(wei.masked_fill(tril == 0, float('-inf')), dim=-1)
        return wei @ value(x)
    return head
heads = [make_head() for _ in range(n_head)]
proj = nn.Linear(n_embd, n_embd)
dims('x', 'T C'); dims('h1', 'T hs'); dims('h2', 'T hs'); dims('cat', 'T C'); dims('out', 'T C')
x = torch.randn(T, n_embd)               #: 输入：3 个位置 × 4 维
h1 = heads[0](x)                         #: 头 1（第 15–17 课的整个 Head）：输出 `(T, 2)`
h2 = heads[1](x)                         #: 头 2：结构一样、权重不同，输出也是 `(T, 2)`
hl('cat', S[:, :2])
cat = torch.cat([h1, h2], dim=-1)        #: 沿最后一维拼起来：左 2 列（加框）来自头 1，右 2 列来自头 2 → `(T, 4)`，又回到 n_embd 宽
out = proj(cat)                          #: `proj`（4 → 4 的 Linear）把两个头的结果混在一起，形状不变。真实代码后面还有一个 dropout
```

<div class="predict">

**先猜一猜**：为什么 `self.heads` 必须用 `nn.ModuleList`，不能用普通 Python list？

<details><summary>想好了再点开</summary>

`nn.Module` 只会登记直接赋给它的子模块和 `ModuleList` / `Sequential` 里的模块。放在普通 list 里，`model.parameters()` 找不到这些 Head 的权重：优化器不会更新它们，`.to(device)` 也不会搬它们。代码能跑，但这些头永远不会学习。

</details>
</div>

## 你的任务

补全 `__init__` 的两行和 `forward` 的两行。

<details><summary>提示</summary>

`torch.cat([...], dim=-1)` 沿最后一维拼接。`self.proj` 的输入宽度是 `head_size * num_heads`。

</details>

## 通过之后

注意力负责让位置之间**交流**。交流完，每个位置还需要自己**消化**收到的信息。这是下一课前馈层的工作。
