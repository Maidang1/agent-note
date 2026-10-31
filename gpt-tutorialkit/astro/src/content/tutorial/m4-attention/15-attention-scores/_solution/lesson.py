from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
torch, nn, F = ns['torch'], ns['nn'], ns['F']
n_embd, block_size, dropout = ns['n_embd'], ns['block_size'], ns['dropout']


class Head(nn.Module):
    """ one head of self-attention """

    def __init__(self, head_size):
        super().__init__()
        self.key = nn.Linear(n_embd, head_size, bias=False)
        self.query = nn.Linear(n_embd, head_size, bias=False)
        self.value = nn.Linear(n_embd, head_size, bias=False)
        self.register_buffer('tril', torch.tril(torch.ones(block_size, block_size)))

        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        # input of size (batch, time-step, channels)
        # output of size (batch, time-step, head size)
        B,T,C = x.shape
        k = self.key(x)
        q = self.query(x)
        # compute attention scores ("affinities")
        wei = q @ k.transpose(-2,-1) * k.shape[-1]**-0.5
        wei = wei.masked_fill(self.tril[:T, :T] == 0, float('-inf'))
        wei = F.softmax(wei, dim=-1)
        wei = self.dropout(wei)
        v = self.value(x)
        out = wei @ v
        return out


h = Head(8)
x = torch.randn(2, 5, n_embd)
print('输入', tuple(x.shape), '→ 输出', tuple(h(x).shape))

# 实验：为什么要乘 head_size ** -0.5
hs = 64
q, k = torch.randn(1000, hs), torch.randn(1000, hs)
raw = (q * k).sum(-1)           # 1000 个 q·k 点积
scaled = raw * hs**-0.5
print(f'q·k 的方差：不缩放 {raw.var():.1f}，缩放后 {scaled.var():.2f}')
logits = torch.tensor([0.1, -0.2, 0.3, -0.2, 0.5])
print('温和的打分 softmax:', F.softmax(logits, -1).numpy().round(3))
print('放大 8 倍后 softmax:', F.softmax(logits * 8, -1).numpy().round(3), '← 大部分权重压到了一个位置上')
