---
title: generate：一个字符一个字符往外写
module: m2-bigram
goal: 写出自回归生成循环：预测 → 取最后一位 → softmax → 抽样 → 接上。
refs: bigram.py:83-96
---

## 为什么一次只写一个字符

模型只会做一件事：看上文，给下一个字符打分。想写一整段，就把这件事循环起来：

1. 对当前上文 `idx` 做 forward，得到每个位置的打分 `(B, T, C)`
2. 只要**最后一个位置**的打分 `(B, C)`——它才是对「下一个字符」的猜测
3. softmax 变成概率
4. 按概率**抽**一个字符（不是直接取最大的）
5. 接到 `idx` 末尾，回到第 1 步

这叫**自回归**：每一步的输出成为下一步的输入。ChatGPT 生成回答也是这样一个 token 一个 token 往外蹦的。

为什么要抽样而不总选最高分？总选最高分（greedy）会让文字很快陷入重复循环；按概率抽样能写出更多样的内容。

```tensors 图解：生成一个字符时，张量怎么变（B=1，上文 "he"，4 个候选字符）
voc = ['e', 'h', 'l', 'o']
table = nn.Embedding(4, 4)
dims('idx', 'B T'); as_chars('idx', voc)
idx = torch.tensor([[1, 0]])             #: 当前上文 `"he"`，形状 `(1, 2)`
dims('logits', 'B T C'); dims('logits', 'B C'); labels('logits', rows=['he'], cols=voc)
logits, loss = table(idx), None          #: forward：每个位置都有 4 个打分，`(1, 2, 4)`
before('logits'); hl('logits', S[:, -1, :])
logits = logits[:, -1, :]                #: 只要最后一个位置（加框的那行）→ `(1, 4)`：对「`e` 后面是什么」的打分
dims('probs', 'B C'); labels('probs', cols=voc)
probs = F.softmax(logits, dim=-1)        #: 打分 → 概率，每行加起来是 1
dims('idx_next', 'B 1'); as_chars('idx_next', voc)
idx_next = torch.multinomial(probs, num_samples=1)   #: 按概率**抽**一个编号 → `(1, 1)`
idx = torch.cat((idx, idx_next), dim=1)  #: 沿时间维接到末尾 → `(1, 3)`。下一轮拿它再来一遍
```

<div class="predict">

**先猜一猜**：模型还没训练，生成的 200 个字符会是什么样子？

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

Bigram 每次都把**整段**上文喂给 forward，但只用了最后一个字符，前面的计算全浪费了。GPT 的 generate 几乎一样，只多一步：上文太长时截掉前面，只保留最近 `block_size` 个（第 25 课）。
