---
type: lesson
title: "generate：上文太长就截掉前面"
---

## 为什么需要裁剪

GPT 的 generate 和第 9 课的 Bigram 版本几乎一样，只多了一行：

```python
idx_cond = idx[:, -block_size:]
```

原因在位置嵌入：`position_embedding_table` 只有 `block_size` 行，模型只认识位置 0..block_size-1。生成到第 block_size+1 个字符时，如果把整段都送进去，就要查第 block_size 号位置，越界报错。

所以每一步只把<strong>最近 block_size 个字符</strong>交给模型。这就是<strong>上下文窗口</strong>：本课的模型最多看 8 个字符，原版是 256 个。窗口之外的内容，模型完全看不到。今天的大模型上下文窗口有几十万 token，但原理一样：超出窗口的部分就是「忘了」。

`idx` 本身不裁剪，它保存生成的完整文本；只有送进模型的 `idx_cond` 是截短的。

<div class="predict">

<strong>先猜一猜</strong>：去掉裁剪那一行，生成到第几个字符时会报错？报什么错？

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

<strong>模块 5 完成：`GPTLanguageModel` 整个类都是你写过的了。</strong>它现在会生成乱码，因为还没训练。下一个模块把它训起来。
