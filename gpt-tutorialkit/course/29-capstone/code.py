# 结业：不看前面的课，从这个骨架写出完整的 gpt.py。
# 超参数按本机 CPU 调小了，判题器会用同一套超参数和原版逐项比对，请不要改动。
import torch
import torch.nn as nn
from torch.nn import functional as F
from tutorial_runtime import CORPUS, TODO

# hyperparameters
batch_size = 16
block_size = 32
max_iters = 500
eval_interval = 100
learning_rate = 1e-3
device = 'cpu'
eval_iters = 10
n_embd = 64
n_head = 4
n_layer = 3
dropout = 0.1
# ------------

torch.manual_seed(1337)

with open(CORPUS, 'r', encoding='utf-8') as f:
    text = f.read()

# here are all the unique characters that occur in this text
chars = sorted(list(set(text)))  # @TODO 所有出现过的字符，去重并排序（第 2 课）
vocab_size = len(chars)  # @TODO 字符表大小
# create a mapping from characters to integers
stoi = { ch:i for i,ch in enumerate(chars) }  # @TODO 字符 → 编号（第 3 课）
itos = { i:ch for i,ch in enumerate(chars) }  # @TODO 编号 → 字符
encode = lambda s: [stoi[c] for c in s]  # @TODO 字符串 → 编号列表
decode = lambda l: ''.join([itos[i] for i in l])  # @TODO 编号列表 → 字符串

# Train and test splits
data = torch.tensor(encode(text), dtype=torch.long)  # @TODO 整本书编码成 long 张量（第 4 课）
n = int(0.9*len(data))  # @TODO 前 90% 训练
train_data = data[:n]  # @TODO 前 n 个
val_data = data[n:]  # @TODO 剩下的

# data loading
def get_batch(split):
    data = train_data if split == 'train' else val_data  # @TODO! 随机切出 batch_size 段长 block_size 的 x，y 往后错一位（第 5 课）
    ix = torch.randint(len(data) - block_size, (batch_size,))  # @DROP
    x = torch.stack([data[i:i+block_size] for i in ix])  # @DROP
    y = torch.stack([data[i+1:i+block_size+1] for i in ix])  # @DROP
    x, y = x.to(device), y.to(device)  # @DROP
    return x, y  # @DROP

@torch.no_grad()
def estimate_loss():
    out = {}  # @TODO! eval 模式下各取 eval_iters 批算平均 loss，返回 {'train': ..., 'val': ...}，最后切回 train（第 11 课）
    model.eval()  # @DROP
    for split in ['train', 'val']:  # @DROP
        losses = torch.zeros(eval_iters)  # @DROP
        for k in range(eval_iters):  # @DROP
            X, Y = get_batch(split)  # @DROP
            logits, loss = model(X, Y)  # @DROP
            losses[k] = loss.item()  # @DROP
        out[split] = losses.mean()  # @DROP
    model.train()  # @DROP
    return out  # @DROP

class Head(nn.Module):
    """ one head of self-attention """

    def __init__(self, head_size):
        super().__init__()
        self.key = nn.Linear(n_embd, head_size, bias=False)  # @TODO! key / query / value、tril buffer、dropout（第 14 课）
        self.query = nn.Linear(n_embd, head_size, bias=False)  # @DROP
        self.value = nn.Linear(n_embd, head_size, bias=False)  # @DROP
        self.register_buffer('tril', torch.tril(torch.ones(block_size, block_size)))  # @DROP
        self.dropout = nn.Dropout(dropout)  # @DROP

    def forward(self, x):
        B,T,C = x.shape  # @TODO! 缩放打分 → 因果遮罩 → softmax → dropout → 加权求和 value（第 15–17 课）
        k = self.key(x)  # @DROP
        q = self.query(x)  # @DROP
        wei = q @ k.transpose(-2,-1) * k.shape[-1]**-0.5  # @DROP
        wei = wei.masked_fill(self.tril[:T, :T] == 0, float('-inf'))  # @DROP
        wei = F.softmax(wei, dim=-1)  # @DROP
        wei = self.dropout(wei)  # @DROP
        v = self.value(x)  # @DROP
        out = wei @ v  # @DROP
        return out  # @DROP

class MultiHeadAttention(nn.Module):
    """ multiple heads of self-attention in parallel """

    def __init__(self, num_heads, head_size):
        super().__init__()
        self.heads = nn.ModuleList([Head(head_size) for _ in range(num_heads)])  # @TODO! heads、proj、dropout（第 18 课）
        self.proj = nn.Linear(head_size * num_heads, n_embd)  # @DROP
        self.dropout = nn.Dropout(dropout)  # @DROP

    def forward(self, x):
        out = torch.cat([h(x) for h in self.heads], dim=-1)  # @TODO! 各头输出拼起来，过 proj 和 dropout
        out = self.dropout(self.proj(out))  # @DROP
        return out  # @DROP

class FeedFoward(nn.Module):
    """ a simple linear layer followed by a non-linearity """

    def __init__(self, n_embd):
        super().__init__()
        self.net = nn.Sequential(  # @TODO! self.net：放大 4 倍 → ReLU → 缩回 → Dropout（第 19 课）
            nn.Linear(n_embd, 4 * n_embd),  # @DROP
            nn.ReLU(),  # @DROP
            nn.Linear(4 * n_embd, n_embd),  # @DROP
            nn.Dropout(dropout),  # @DROP
        )  # @DROP

    def forward(self, x):
        return self.net(x)

class Block(nn.Module):
    """ Transformer block: communication followed by computation """

    def __init__(self, n_embd, n_head):
        super().__init__()
        head_size = n_embd // n_head  # @TODO! sa、ffwd、ln1、ln2，注意创建顺序（第 20 课）
        self.sa = MultiHeadAttention(n_head, head_size)  # @DROP
        self.ffwd = FeedFoward(n_embd)  # @DROP
        self.ln1 = nn.LayerNorm(n_embd)  # @DROP
        self.ln2 = nn.LayerNorm(n_embd)  # @DROP

    def forward(self, x):
        x = x + self.sa(self.ln1(x))  # @TODO! 预归一化 + 两次残差
        x = x + self.ffwd(self.ln2(x))  # @DROP
        return x  # @DROP

class GPTLanguageModel(nn.Module):

    def __init__(self):
        super().__init__()
        self.token_embedding_table = nn.Embedding(vocab_size, n_embd)  # @TODO! 两张嵌入表、n_layer 个 Block、ln_f、lm_head（第 21 课）
        self.position_embedding_table = nn.Embedding(block_size, n_embd)  # @DROP
        self.blocks = nn.Sequential(*[Block(n_embd, n_head=n_head) for _ in range(n_layer)])  # @DROP
        self.ln_f = nn.LayerNorm(n_embd)  # @DROP
        self.lm_head = nn.Linear(n_embd, vocab_size)  # @DROP
        self.apply(self._init_weights)  # @TODO! 对所有子模块应用 _init_weights

    def _init_weights(self, module):
        if isinstance(module, nn.Linear):  # @TODO! Linear 和 Embedding 的权重 N(0, 0.02)，Linear 的 bias 置 0（第 22 课）
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)  # @DROP
            if module.bias is not None:  # @DROP
                torch.nn.init.zeros_(module.bias)  # @DROP
        elif isinstance(module, nn.Embedding):  # @DROP
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)  # @DROP

    def forward(self, idx, targets=None):
        B, T = idx.shape  # @TODO! 嵌入相加 → blocks → ln_f → lm_head；有 targets 时展平算交叉熵（第 23–24 课）
        tok_emb = self.token_embedding_table(idx)  # @DROP
        pos_emb = self.position_embedding_table(torch.arange(T, device=device))  # @DROP
        x = tok_emb + pos_emb  # @DROP
        x = self.blocks(x)  # @DROP
        x = self.ln_f(x)  # @DROP
        logits = self.lm_head(x)  # @DROP
        if targets is None:  # @DROP
            loss = None  # @DROP
        else:  # @DROP
            B, T, C = logits.shape  # @DROP
            logits = logits.view(B*T, C)  # @DROP
            targets = targets.view(B*T)  # @DROP
            loss = F.cross_entropy(logits, targets)  # @DROP
        return logits, loss  # @DROP

    def generate(self, idx, max_new_tokens):
        for _ in range(max_new_tokens):  # @TODO! 每步：截取最后 block_size 个 → 前向 → 取最后位置 → softmax → 采样 → 拼接（第 25 课）
            idx_cond = idx[:, -block_size:]  # @DROP
            logits, loss = self(idx_cond)  # @DROP
            logits = logits[:, -1, :]  # @DROP
            probs = F.softmax(logits, dim=-1)  # @DROP
            idx_next = torch.multinomial(probs, num_samples=1)  # @DROP
            idx = torch.cat((idx, idx_next), dim=1)  # @DROP
        return idx  # @DROP

model = GPTLanguageModel()  # @TODO 建模型（第 26 课）
m = model.to(device)  # @TODO 搬到 device
print(sum(p.numel() for p in m.parameters())/1e6, 'M parameters')

optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)  # @TODO AdamW 优化器

for iter in range(max_iters):  # @TODO! 训练循环：定期和最后一步评估并打印，每步抽数据、前向、清梯度、反向、更新（第 27 课）
    if iter % eval_interval == 0 or iter == max_iters - 1:  # @DROP
        losses = estimate_loss()  # @DROP
        print(f"step {iter}: train loss {losses['train']:.4f}, val loss {losses['val']:.4f}")  # @DROP
    xb, yb = get_batch('train')  # @DROP
    logits, loss = model(xb, yb)  # @DROP
    optimizer.zero_grad(set_to_none=True)  # @DROP
    loss.backward()  # @DROP
    optimizer.step()  # @DROP

# generate from the model
context = torch.zeros((1, 1), dtype=torch.long, device=device)
print(decode(m.generate(context, max_new_tokens=300)[0].tolist()))
