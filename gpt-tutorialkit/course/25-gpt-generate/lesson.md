---
title: generate：上文太长就截掉前面
module: m5-gpt
goal: 在 Bigram 的生成循环上加一行裁剪，让 GPT 能写任意长的文字。
refs: gpt.py:181-196
---

## 为什么需要裁剪

GPT 的 generate 和第 9 课的 Bigram 版本几乎一样，只多了一行：

```python
idx_cond = idx[:, -block_size:]
```

原因在位置嵌入：`position_embedding_table` 只有 `block_size` 行，模型只认识位置 0..block_size-1。生成到第 block_size+1 个字符时，如果把整段都送进去，就要查第 block_size 号位置，越界报错。

所以每一步只把**最近 block_size 个字符**交给模型。这就是**上下文窗口**：本课的模型最多看 8 个字符，原版是 256 个。窗口之外的内容，模型完全看不到。今天的大模型上下文窗口有几十万 token，但原理一样：超出窗口的部分就是「忘了」。

`idx` 本身不裁剪，它保存生成的完整文本；只有送进模型的 `idx_cond` 是截短的。

```tensors 图解：idx 越来越长，送进模型的只有最后 block_size 个（block_size=4）
voc = list('abcdefgh')
block_size = 4
dims('idx', 'B T'); as_chars('idx', voc); dims('idx_cond', 'B T'); as_chars('idx_cond', voc)
idx = torch.tensor([[0, 1, 2]])          #: 刚开始生成：上文 3 个字符，还没超过 block_size
idx_cond = idx[:, -block_size:]          #: 不足 4 个时，`[-4:]` 取到全部，不会报错
idx = torch.tensor([[0, 1, 2, 3, 4, 5]]) #: 又生成了 3 个：现在 6 个字符，超过了 block_size
hl('idx', S[:, -block_size:]); show('idx')
idx_cond = idx[:, -block_size:]          #: 只截最后 4 个（加框）送进模型。`idx` 本身不裁剪，保存着完整文本
idx = torch.cat((idx, torch.tensor([[6]])), dim=1)   #: 新抽到的字符接到 `idx` 末尾
hl('idx', S[:, -block_size:]); show('idx')
idx_cond = idx[:, -block_size:]          #: 下一轮再截最后 4 个：窗口向右滑了一格，最早的 `c` 被「忘掉」了
```

<div class="predict">

**先猜一猜**：去掉裁剪那一行，生成到第几个字符时会报错？报什么错？

<details><summary>想好了再点开</summary>

上文从 1 个字符开始，第 8 轮之后长度变成 9，再做 forward 时要查位置 8，而表只有 0..7。报 `IndexError: index out of range in self`。可以把 `idx_cond = idx` 试试。

</details>
</div>

## 你的任务

补全裁剪和 forward 两行，其他部分和第 9 课一样，已经写好了。

<details><summary>提示</summary>

负数切片 `[-block_size:]` 取最后 block_size 个；如果长度还不够 block_size，就取全部，不会报错。

</details>

## 通过之后

**模块 5 完成：`GPTLanguageModel` 整个类都是你写过的了。**它现在会生成乱码，因为还没训练。下一个模块把它训起来。
