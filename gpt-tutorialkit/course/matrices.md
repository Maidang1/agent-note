不需要先学完线性代数。读这章时，每次只问三件事：**输入是什么形状？哪几格参与计算？输出放在哪里？** 图里的行列下标从 0 开始；加框表示参与这一步的格子，变淡表示暂时不用的格子。颜色辅助比较数值，具体结果看格子里的数字。

这是一章可以随时回看的基础图解。先看前五节；后面的函数在课程用到时再查。[跳到函数索引](#function-index)。

<h2 id="shape">1. 标量、向量、矩阵、张量：shape 是每条轴的长度</h2>

标量是一个数，shape 是 `()`；向量是一排数，shape 是 `(C,)`；矩阵有行和列，shape 是 `(T, C)`。张量可以有更多轴：GPT 常用 `(B, T, C)`，表示 B 段文字、每段 T 个位置、每个位置 C 个特征。画三维张量时，按 B 拆成几张 T × C 的小矩阵。

`dim=0` 是第一条轴，`dim=1` 是第二条轴；负数从末尾数，`dim=-1` 是最后一条轴。在 `(B, T, C)` 里，`-1` 指 C，`-2` 指 T。

```tensors 图解：同一批数字，从一个数到一批矩阵
scalar = torch.tensor(3.)                       #: 标量：只有一个值，没有行列轴
vector = torch.tensor([1., 2., 3.])             #: 向量：3 个特征，shape 为 `(3,)`
dims('matrix', 'T C')
matrix = torch.tensor([[1., 2., 3.], [4., 5., 6.]])   #: 矩阵：2 行 × 3 列。第 0 行是第 0 个位置的特征
dims('batch', 'B T C')
batch = torch.stack([matrix, matrix + 10])      #: 三维张量：2 段，每段 2 行 × 3 列。两个 B 面板各自保存一段
shape = tuple(batch.shape)                     #: `.shape` 读取三条轴的长度；`.numel()` 则数全部格子
size = batch.numel()                           #: 一共有 2 × 2 × 3 = 12 个数
```

<h2 id="elementwise">2. 逐元素运算：对应格子各算各的</h2>

两个相同形状的张量做 `+`、`-`、`*`、`/`，会把对应位置配对计算。张量乘一个标量，则每一格都乘同一个数。**`*` 是逐元素乘法；`@` 是下一节的矩阵乘法。** 残差连接 `x + delta` 就是对应格子相加，注意力打分的缩放则是每一格乘 `head_size ** -0.5`。

```tensors 图解：逐元素相加、相乘与缩放
a = torch.tensor([[1., 2.], [3., 4.]])           #: 输入 a
b = torch.tensor([[10., 20.], [30., 40.]])       #: 输入 b，与 a 同样是 `(2, 2)`
added = a + b                                  #: 对应格子相加：左上角 1+10=11，右下角 4+40=44
product = a * b                                #: 对应格子相乘：左上角 1×10=10，右下角 4×40=160
scaled = a * 0.5                               #: 每格乘 0.5，形状不变
```

<h2 id="matmul">3. 矩阵乘法 @：左边一行，右边一列</h2>

`(M, K) @ (K, N) → (M, N)`。中间两个 K 必须相同；结果保留左边的行数 M 和右边的列数 N。输出第 i 行第 j 列，是左矩阵第 i 行与右矩阵第 j 列**逐对相乘再相加**，这叫点积。

```tensors 图解：手算一格，再看整个矩阵乘法
dims('a', 'M K'); dims('b', 'K N'); dims('out', 'M N')
a = torch.tensor([[1., 2., 3.], [4., 5., 6.]])   #: 左边 `(2, 3)`：两行，每行 3 个数
b = torch.tensor([[1., 0.], [0., 1.], [1., 1.]]) #: 右边 `(3, 2)`：两列，每列 3 个数
out = a @ b                                     #: 输出 `(2, 2)`：左边的每行与右边的每列各算一次点积
hl('a', S[1]); hl('b', S[:, 0]); hl('out', S[1, 0]); show('a', 'b', 'out')
cell = (a[1] * b[:, 0]).sum()                   #: 看第 1 行第 0 列：4×1 + 5×0 + 6×1 = 10
dims('batched', 'B M K'); dims('batched_out', 'B M N')
batched = torch.stack([a, a * 2])                #: 加上 B 轴，输入变成 `(2, 2, 3)`
batched_out = batched @ b                        #: 每个 B 面板分别乘同一份 b，得到 `(2, 2, 2)`；不同段不会混在一起
```

后面的 `wei @ v` 就用这条规则：`(B, T, T) @ (B, T, hs) → (B, T, hs)`。每行权重乘上各位置的 value，再求和。它可以混合不同位置的信息。

<h2 id="transpose">4. transpose：交换两条轴，不做加减乘除</h2>

矩阵转置把行变成列。原来的 `x[i, j]` 出现在 `xT[j, i]`。注意力里的 `k.transpose(-2, -1)` 把 `(B, T, hs)` 变成 `(B, hs, T)`，让每个位置的 key 成为一列，供 query 的每一行去匹配。

```tensors 图解：转置把一行改放成一列
dims('x', 'T C'); dims('xT', 'C T')
x = torch.tensor([[1., 2., 3.], [4., 5., 6.]])   #: 原矩阵：2 行 × 3 列
hl('x', S[0]); show('x'); hl('xT', S[:, 0])
xT = x.transpose(-2, -1)                        #: 第一行 [1,2,3] 变成第一列；shape 变为 `(3, 2)`
```

`nn.Linear(C, hs)` 的权重 W 存成 `(hs, C)`，计算是 `x @ W.transpose(-2, -1) + bias`。Head 的三个 Linear 都没有 bias，所以只做矩阵乘法。对每个位置用同一份权重，改变特征宽度。

```tensors 图解：Linear 是矩阵乘法加 bias
x = torch.tensor([[1., 2., 3.], [4., 5., 6.]])   #: 两个位置，每个位置 3 个特征
W = torch.tensor([[1., 0., 1.], [0., 1., 1.]])   #: 两个输出特征各有一行权重，shape 为 `(2, 3)`
bias = torch.tensor([10., 20.])                  #: 每个输出特征一个偏移，shape 为 `(2,)`
out = F.linear(x, W, bias)                      #: 每行都用相同的 W 和 bias，从 3 维变成 2 维
manual = x @ W.transpose(-2, -1) + bias          #: 展开 Linear，得到完全相同的格子
```

<h2 id="broadcast">5. 广播：从最后一条轴开始对齐</h2>

相加、相除时，形状不同也可能兼容。从末尾对齐，每条轴必须**长度相同，或有一边长度为 1**；缺少的前导轴按 1 处理。长度为 1 的轴在计算时重复使用同一份值，不必真的复制一张新表。

`(T, C) + (C,)` 给每行加同一份特征偏移；`(T, C) / (T, 1)` 给每行除以它自己的一个数。注意 `(T,)` 会对齐最后的 C 轴，不会自动变成“每行一个数”。

```tensors 图解：一份行向量与一列行和，分别怎样广播
x = torch.tensor([[1., 2., 3.], [4., 5., 6.]])   #: 2 行 × 3 列
offset = torch.tensor([10., 20., 30.])           #: `(3,)` 对齐列轴，视作 `(1, 3)`
added = x + offset                             #: 两行都加同一份 [10,20,30]
row_sum = x.sum(dim=-1, keepdim=True)            #: 每行的和，保留列轴，得到 `(2, 1)`：6 和 15
normalized = x / row_sum                        #: 第一行每格除以 6，第二行每格除以 15
dims('batch', 'B T C'); dims('with_position', 'B T C')
batch = torch.stack([x, x * 2])                 #: 两段输入，shape 为 `(2, 2, 3)`
position = torch.tensor([[10., 0., 0.], [0., 20., 0.]])   #: 每个位置一份向量 `(2, 3)`，不带 B 轴
with_position = batch + position               #: `(B,T,C)+(T,C)`：每段的对应位置加同一份位置向量
```

<h2 id="reduce">6. sum / mean / keepdim：沿哪条轴汇总</h2>

`sum(dim=...)` 沿指定轴把数相加；`mean` 再除以该轴长度。被汇总的轴通常会消失；`keepdim=True` 让它留下来，长度变成 1，便于下一步广播。

```tensors 图解：沿列求和与沿行平均
x = torch.tensor([[1., 2., 3.], [4., 5., 6.]])   #: 输入 `(2, 3)`
row_sum = x.sum(dim=1)                          #: 沿列轴相加，每行剩一个数 → `(2,)`：[6,15]
column_mean = x.mean(dim=0)                     #: 沿行轴平均，每列剩一个数 → `(3,)`：[2.5,3.5,4.5]
kept = x.sum(dim=1, keepdim=True)                #: 每行求和但保留轴 → `(2,1)`，与原矩阵按行广播
```

<h2 id="view">7. view / reshape：重新分组，保持元素个数</h2>

训练算 loss 时，要把 `(B, T, V)` 的每个位置摊成一行 `(B*T, V)`，答案也按同样顺序摊平。`view` 不改变数字，只换形状；`reshape` 在不能直接共享原存储时可能复制。转置改变轴的排列，**不能用 view 代替 transpose**。转置后的张量可能不兼容某个 view，这时用 `reshape` 或先 `.contiguous()`。

```tensors 图解：两段数据摊成四行，答案也按相同顺序排列
dims('x', 'B T C'); dims('flat', 'B*T C')
x = torch.arange(12).view(2, 2, 3)              #: B=2、T=2、C=3；按 B 分成两块
flat = x.view(4, 3)                             #: B 和 T 合并：第一段的两行在前，第二段的两行在后
targets = torch.tensor([[0, 2], [1, 0]])         #: 每段的每个位置一个答案
flat_targets = targets.view(-1)                 #: `-1` 让 PyTorch 自动算长度；答案次序仍是 [0,2,1,0]
```

<h2 id="indexing">8. 下标、切片与查表：拿出哪几格</h2>

`:` 取整条轴，`-1` 取最后一项，`a:b` 取从 a 到 b 之前的范围。单个整数下标会去掉这条轴；切片保留这条轴。`nn.Embedding(V, C)` 则用编号取参数表的一整行，每个编号变成 C 个数。

```tensors 图解：取最后一个位置、保留窗口、按编号查表
dims('x', 'B T C'); dims('last', 'B C'); dims('window', 'B T C')
x = torch.arange(18).view(2, 3, 3)               #: 两段、每段三个位置、每个位置三个数
hl('x', S[:, -1, :]); show('x')
last = x[:, -1, :]                              #: 所有段的最后一个位置，时间轴消失 → `(2,3)`
window = x[:, -2:, :]                           #: 所有段只保留最近两个位置，时间轴仍在 → `(2,2,3)`
table = nn.Embedding(4, 2)
table.weight.data.copy_(torch.tensor([[10.,11.], [20.,21.], [30.,31.], [40.,41.]]))
W = table.weight                               #: 一张 4 行 × 2 列的表
idx = torch.tensor([[2, 0, 2]])                  #: 输入三个编号
embedded = table(idx)                           #: 按 2、0、2 的顺序取行，shape 从 `(1,3)` 变成 `(1,3,2)`
```

<h2 id="join">9. stack 与 cat：新增一条轴，或延长现有轴</h2>

`stack` 把相同形状的张量叠起来，**新增轴**；`cat` 沿已有的轴接起来，**轴数不变**。抽 batch 用 stack；生成时沿 T 轴 cat；多个注意力头沿 C 轴 cat。

```tensors 图解：相同的两段数，三种拼法
a = torch.tensor([1, 2, 3])                     #: 第一段 `(3,)`
b = torch.tensor([4, 5, 6])                     #: 第二段 `(3,)`
stacked = torch.stack([a, b], dim=0)            #: 新增第 0 轴，变成两行 `(2,3)`
joined = torch.cat([a, b], dim=0)               #: 延长原有轴，仍是一维 `(6,)`
next_token = torch.tensor([[7], [8]])           #: 每段新生成一个编号 `(2,1)`
longer = torch.cat([stacked, next_token], dim=1) #: 沿时间轴接一列，变成 `(2,4)`
head1 = torch.tensor([[1.,2.], [3.,4.]])
head2 = torch.tensor([[10.,20.], [30.,40.]])
heads = torch.cat([head1, head2], dim=-1)        #: 两个头沿特征轴拼接，每个位置从 2 维变成 4 维
```

<h2 id="softmax">10. softmax：一行打分变成一行概率</h2>

对每行先取指数，再除以这一行指数的和：`p_j = exp(s_j) / sum(exp(s))`。分数越大，分到的概率越大；每行概率之和为 1。实际实现会先减去行内最大值，保持结果不变，同时避免指数溢出。注意力里的 `dim=-1` 是沿“被关注的位置”分配权重；生成时则是沿“候选字符”分配概率。

```tensors 图解：打分 → 指数 → 归一化
scores = torch.tensor([[0., 1., 2.], [2., 2., 2.]])   #: 第一行分数不同，第二行分数相同
shifted = scores - scores.max(dim=-1, keepdim=True).values   #: 每行减去最大值，结果的相对差距不变
exp_scores = shifted.exp()                     #: 取指数，所有格子变成正数
denominator = exp_scores.sum(dim=-1, keepdim=True)   #: 每行指数之和，shape 为 `(2,1)`
probs = exp_scores / denominator               #: 每行除以自己的和：第一行偏向最大分，第二行均分
official = F.softmax(scores, dim=-1)            #: softmax 一步完成同样的计算
row_total = probs.sum(dim=-1)                   #: 每行和都是 1
```

<h2 id="mask">11. tril / masked_fill：先遮未来，再分配权重</h2>

下三角矩阵 `tril` 的第 i 行只允许第 0 到 i 列：当前位置能看自己和过去。`masked_fill(条件, 值)` 把条件为 True 的格子替换成指定值。先把未来填成 `-inf`，再 softmax：`exp(-inf)=0`，未来的概率正好为 0。

```tensors 图解：从全 1 到下三角，再把未来遮掉
ones = torch.ones(3, 3)                        #: 先准备一张全 1 的表
tril = torch.tril(ones)                         #: 保留主对角线和下面的格子，右上角变成 0
mask = tril == 0                               #: True 表示要遮住的格子
scores = torch.tensor([[0.,1.,2.], [2.,1.,0.], [0.,0.,0.]])   #: 每个位置对所有位置的原始打分
masked = scores.masked_fill(mask, float('-inf')) #: 未来的格子换成 −∞
weights = F.softmax(masked, dim=-1)              #: 第 0 行只能看自己；第 1 行看前两项；第 2 行看全部
values = torch.tensor([[10.,0.], [0.,20.], [30.,30.]])   #: 各位置要传出的 value
out = weights @ values                          #: 每行按权重汇总可见的 value，未来格子不会贡献
```

<h2 id="loss">12. cross_entropy：取正确答案的概率，再取 -log 和平均</h2>

`F.cross_entropy(logits, targets)` 接收原始打分和正确编号。下面把它展开：逐行选出正确列，再计算 `-log(p)`。概率越小，损失越大。训练时直接把 logits 交给 cross_entropy；它内部用数值稳定的计算完成这一过程。

```tensors 图解：每行取一个正确答案，最后得到一个 loss
logits = torch.tensor([[0.,1.,2.], [2.,1.,0.]])  #: 两道题，每题三个候选
targets = torch.tensor([2, 1])                  #: 第 0 题答案为第 2 列，第 1 题答案为第 1 列
probs = F.softmax(logits, dim=-1)                #: 每行的候选概率
hl('probs', S[torch.arange(2), targets]); show('probs')
correct = probs[torch.arange(2), targets]       #: 下标按对配合：取 [0,2] 和 [1,1] 两格
nll = -correct.log()                            #: 对正确概率取 -log：猜得越差，数越大
manual_loss = nll.mean()                        #: 两道题平均成一个标量
loss = F.cross_entropy(logits, targets)         #: 与展开计算相同
```

<h2 id="sampling">13. multinomial：按概率抽一个编号</h2>

`torch.multinomial(probs, num_samples=1)` 每行按权重抽一个下标，输出 `(B,1)`。抽样一次不保证得到最大概率的项；长期重复抽样时，高概率的项通常出现更多。抽到的是**编号**，不是概率值。

```tensors 图解：两段各抽一个新字符，再接到上文
probs = torch.tensor([[0.1, 0.2, 0.7], [0.8, 0.1, 0.1]])   #: 两段各有三个候选，概率之和为 1
torch.manual_seed(1337)
next_id = torch.multinomial(probs, num_samples=1)   #: 每行各抽一个编号，输出 `(2,1)`
context = torch.tensor([[0,1], [2,0]])           #: 两段原上文 `(2,2)`
generated = torch.cat([context, next_id], dim=1) #: 接到时间轴末尾，两段都增加一个位置
```

<h2 id="layers">14. ReLU、LayerNorm、Dropout：形状相同，数值怎样变化</h2>

ReLU 把负数变成 0；LayerNorm 沿每个位置的特征轴归一化，随后乘可学习的 weight、加 bias；Dropout 在 train 模式随机置零，其余值乘 `1/(1-p)`，eval 模式原样输出。

```tensors 图解：三个层各自作用于同一张小矩阵
x = torch.tensor([[-2.,0.,2.,4.], [1.,2.,3.,4.]])   #: 两个位置，每个位置四个特征
relu = F.relu(x)                                #: 负数置零，其他值保留
ln = nn.LayerNorm(4)
normalized = ln(x)                              #: 每行各自归一化，默认 weight=1、bias=0，保留 `(2,4)`
mean = x.mean(dim=-1, keepdim=True)
variance = x.var(dim=-1, unbiased=False, keepdim=True)
manual = (x - mean) / torch.sqrt(variance + ln.eps)   #: 展开 LayerNorm：用总体方差与 eps，和默认层输出相同
dropout = nn.Dropout(0.5)
torch.manual_seed(1337)
train_out = dropout(x)                          #: train：随机格子变 0，其余乘 2，单次结果的行和不必保持不变
dropout.eval()
eval_out = dropout(x)                           #: eval：每格原样输出
```

<h2 id="function-index">后面教程的函数图解索引</h2>

左侧基础图解释“这一行怎样算”，右侧课程图解释“放进 GPT 后有什么作用”。点击课程链接可以继续看该函数的真实运行过程；每课右侧「看答案」还有整段代码的执行图解。

| 函数 / 写法 | 基础图解 | 在教程里的图解 |
|---|---|---|
| `shape`、`numel()`、B/T/C | [轴与格子数](#shape) | [实验尺寸](/m1-data/01-setup)；[数参数](/m6-train-gpt/26-params-optimizer) |
| `manual_seed`、`randint`、`randn` | [抽样](#sampling) | [固定种子](/m1-data/01-setup)；[随机抽 batch](/m1-data/05-get-batch) |
| `set`、`sorted`、`len` | — | [建立字符表](/m1-data/02-vocab) |
| `enumerate`、字典查找、`join` | [查表的直觉](#indexing) | [encode / decode](/m1-data/03-encode-decode) |
| `tensor`、`long`、切片 | [下标与切片](#indexing) | [训练 / 验证切分](/m1-data/04-train-val)；[窗口裁剪](/m5-gpt/25-gpt-generate) |
| `arange` | [逐行选列](#loss) | [位置编号](/m5-gpt/23-embeddings) |
| `stack`、`cat` | [两种拼法](#join) | [get_batch](/m1-data/05-get-batch)；[多头拼接](/m4-attention/18-multi-head) |
| `Embedding`、`weight` | [按编号取行](#indexing) | [Bigram 参数表](/m2-bigram/06-bigram-table)；[整批查表](/m2-bigram/07-bigram-logits) |
| `@`、`transpose`、`Linear` | [矩阵乘法](#matmul)；[转置与投影](#transpose) | [q/k/v 投影](/m4-attention/14-head-init)；[注意力打分](/m4-attention/15-attention-scores)；[加权 value](/m4-attention/17-weighted-values) |
| `+`、`*`、`/`、广播 | [逐元素](#elementwise)；[广播](#broadcast) | [前缀平均](/m4-attention/13-prefix-average)；[字符 + 位置](/m5-gpt/23-embeddings) |
| `sum`、`mean`、`keepdim`、`item` | [沿轴汇总](#reduce) | [平均 loss](/m3-train/11-estimate-loss) |
| `view`、`reshape`、`log`、`cross_entropy` | [变形](#view)；[交叉熵](#loss) | [手算 loss](/m2-bigram/08-cross-entropy)；[GPT 输出](/m5-gpt/24-gpt-logits) |
| `softmax`、`multinomial` | [打分变概率](#softmax)；[按概率抽样](#sampling) | [逐字符生成](/m2-bigram/09-generate) |
| `ones`、`zeros`、`tril`、`masked_fill` | [因果掩码](#mask) | [前缀平均](/m4-attention/13-prefix-average)；[遮住未来](/m4-attention/16-causal-mask) |
| `Dropout`、`eval`、`train` | [训练 / 评估差异](#layers) | [注意力 dropout](/m4-attention/17-weighted-values) |
| `ReLU`、`Sequential`、`ModuleList` | [非线性](#layers) | [多头并联](/m4-attention/18-multi-head)；[前馈顺序](/m4-attention/19-feed-forward)；[GPT 骨架](/m5-gpt/21-gpt-init) |
| `LayerNorm`、残差 `x + delta` | [逐行归一化](#layers)；[对应相加](#elementwise) | [Block](/m4-attention/20-block) |
| `zero_grad`、`backward`、`AdamW.step` | — | [参数与梯度怎样变](/m3-train/10-train-step)；[训练后概率表](/m3-train/12-train-loop) |
| `normal_`、`zeros_`、`apply` | — | [初始化前后](/m5-gpt/22-init-weights) |
| `to`、`parameters`、`register_buffer` | — | [Head 的参数与 buffer](/m4-attention/14-head-init)；[设备与参数量](/m6-train-gpt/26-params-optimizer) |
| `no_grad`、评估与训练循环 | — | [评估多批](/m3-train/11-estimate-loss)；[最终评估条件](/m6-train-gpt/27-train-gpt) |
| `tolist`、`state_dict`、`save`、`load_state_dict` | [编号与查表](#indexing) | [生成、解码与存档](/m6-train-gpt/28-sample-save) |

读到 `q @ k.transpose(-2, -1)` 时，试着说出：**每段各自计算；q 的一行与 k 的一行做点积；输出第 i 行第 j 列表示位置 i 对位置 j 的打分。** 能说清这句话，再看 Head 的代码就有了抓手。
