---
title: 按权重汇总 value：一个 Head 的完整输出
module: m4-attention
goal: 写完 Head.forward 的最后三行，理解 dropout 在训练和评估时的区别。
refs: gpt.py:86-90
---

## 为什么汇总的是 v 而不是 x

到这里 `wei[b, i, :]` 是位置 i 分给前面每个位置的权重（和为 1）。最后一步 `out = wei @ v`：位置 i 的输出 = 各位置 value 的加权和。这正是第 13 课 `wei @ x` 的升级版——平均的对象从原始 x 换成了学出来的 value。

为什么多一道 value 投影？key 负责「被找到」，value 负责「被找到后交出什么」，分开学更灵活。比如一个元音字符可能因为「我是元音」被关注，但交出去的信息是「我在单词第几位」。

**Dropout**：训练时以概率 p 随机把元素置 0，剩下的乘以 1/(1-p)，保持期望不变；评估时什么也不做。随机丢掉一些注意力连接，迫使模型不要只依赖某一条路径，起到防止过拟合的作用。这就是为什么第 11 课要求评估前 `model.eval()`。

```tensors 图解：out = wei @ v（T=4, head_size=3，只画一段）
T, hs = 4, 3
tril = torch.tril(torch.ones(T, T))
scores = torch.randn(T, T).masked_fill(tril == 0, float('-inf'))
dims('wei', 'T T'); dims('dropped', 'T T'); dims('v', 'T hs'); dims('out', 'T hs')
wei = F.softmax(scores, dim=-1)          #: 上一课得到的权重：每行加起来是 1，右上角是 0
dropout = nn.Dropout(0.5)
dropped = dropout(wei)                   #: train 模式下的 `self.dropout(wei)`：随机一部分权重被置 0，剩下的 ×2（这里 p=0.5；本课 p=0.1）。eval 模式下原样输出，下面按 eval 来看
v = torch.randn(T, hs)                   #: 每个位置的 value：被关注时交出的内容
out = wei @ v                            #: `(T, T) @ (T, hs) = (T, hs)`：第 i 行 = 按 wei 第 i 行的权重，把各位置的 v 加权求和
hl('wei', S[2]); hl('v', S[:3]); hl('out', S[2]); show('wei', 'v', 'out')
wei[2, 0]*v[0] + wei[2, 1]*v[1] + wei[2, 2]*v[2]   #: 验证第 2 行：只用到了 v 的前 3 行（位置 0、1、2），未来的 v[3] 权重为 0
```

<div class="predict">

**先猜一猜**：`nn.Dropout(0.5)` 在 train 模式下作用于 10 个 1，输出里非零元素的值是多少？

<details><summary>想好了再点开</summary>

**2.0**。大约一半被置 0，剩下的乘以 1/(1-0.5) = 2，这样平均值仍然是 1。eval 模式下原样输出 10 个 1。

</details>
</div>

## 你的任务

补全 dropout、value、加权求和三行。

<details><summary>提示</summary>

`self.dropout(wei)`、`self.value(x)`、`wei @ v`。顺序要和原版一样：dropout 在 softmax 之后、乘 v 之前。

</details>

## 通过之后

**一个注意力头写完了。**回头看 `forward`，8 行代码就是：投影出 q、k、v，打分，遮住未来，softmax，dropout，加权汇总。下一课把好几个头并起来。
