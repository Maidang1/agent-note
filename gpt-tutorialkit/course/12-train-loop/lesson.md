---
title: 完整训练循环：看着 loss 往下掉
module: m3-train
goal: 把取数据、训练一步、定期评估拼成完整的训练循环，训完再生成一段文字。
refs: bigram.py:98-122
---

## 为什么这样组织

前三课的零件拼起来，就是 bigram.py 的最后 25 行：

```
建模型、建优化器
循环 max_iters 次：
    每隔 eval_interval 步：estimate_loss() 并打印
    抽一批 → 训练一步
训完：从一个换行符开始生成
```

本课的配置：`batch_size=32`、训练 3000 步、每 500 步评估一次。Bigram 很小，CPU 上几秒就跑完。

```tensors 图解：训练前后，打分表学到了什么（在一段重复的短句上训练小 Bigram）
text = "hello world. " * 50
voc = sorted(set(text))
V = len(voc)
stoi = {c: i for i, c in enumerate(voc)}
data = torch.tensor([stoi[c] for c in text])
def get_batch():
    ix = torch.randint(len(data) - 8, (8,))
    return torch.stack([data[i:i+8] for i in ix]), torch.stack([data[i+1:i+9] for i in ix])
table = nn.Embedding(V, V)
optimizer = torch.optim.AdamW(table.parameters(), lr=1e-1)
dims('probs_before', 'V V'); labels('probs_before', rows=voc, cols=voc)
dims('probs_after', 'V V'); labels('probs_after', rows=voc, cols=voc)
probs_before = F.softmax(table.weight, dim=-1)   #: 训练前，把表的每一行 softmax 成概率：随机数，看不出规律（␣ 是空格）
history = []
for iter in range(300):
    if iter % 50 == 0:
        history.append(F.cross_entropy(table(data[:-1]), data[1:]).item())
    xb, yb = get_batch()
    loss = F.cross_entropy(table(xb).view(-1, V), yb.view(-1))
    optimizer.zero_grad(set_to_none=True)
    loss.backward()
    optimizer.step()
dims('loss_log', 'eval'); labels('loss_log', cols=[f'{s}步' for s in range(0, 300, 50)])
loss_log = torch.tensor(history)         #: 训练循环每隔 50 步评估一次：loss 很快从 2.45 掉到 0.5 左右，然后就降不动了——这句话里 `l` 后面可能是 `l`、`o` 或 `d`，只看前一个字符最多只能猜到这个程度
hl('probs_after', S[stoi['h'], stoi['e']])
probs_after = F.softmax(table.weight, dim=-1)    #: 训练 300 步后：每行的概率集中到「真正跟在后面的字符」上。比如 `h` 行几乎全压在 `e`（加框）
```

<div class="predict">

**先猜一猜**：训完之后 val loss 大概能降到多少？生成的文字会像英文吗？

<details><summary>想好了再点开</summary>

大约 **2.5**，再往下就降不动了，这是只看前一个字符的极限。生成的文字会有「像单词的长度」「大写开头」「换行和冒号像剧本格式」，但拼不出真正的单词。要更好，模型就得看更长的上文——这就是下一个模块要做的。

</details>
</div>

## 你的任务

1. 每隔 `eval_interval` 步评估并打印（照原版的格式：`step 0: train loss ..., val loss ...`）。
2. 抽一批数据，训练一步。
3. 训完生成 300 个字符并打印。

<details><summary>提示 1：什么时候评估</summary>

`if iter % eval_interval == 0:`。第 0 步也会评估，所以能看到训练前的起点。

</details>

<details><summary>提示 2：生成那一行</summary>

`model.generate(context, max_new_tokens=300)` 返回 `(1, 301)`，取 `[0]` 变成一维，`.tolist()` 后交给 `decode`。

</details>

## 通过之后

**模块 3 完成**：数据、模型、loss、训练、评估、生成，整条流水线已经通了。接下来只做一件事：把 `BigramLanguageModel` 换成能看整段上文的 GPT。流水线代码几乎不用改。
