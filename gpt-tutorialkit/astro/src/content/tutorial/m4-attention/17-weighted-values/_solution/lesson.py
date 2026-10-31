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
        B,T,C = x.shape
        k = self.key(x)   # (B,T,hs)
        q = self.query(x) # (B,T,hs)
        wei = q @ k.transpose(-2,-1) * k.shape[-1]**-0.5 # (B, T, T)
        wei = wei.masked_fill(self.tril[:T, :T] == 0, float('-inf')) # (B, T, T)
        wei = F.softmax(wei, dim=-1) # (B, T, T)
        wei = self.dropout(wei)
        # perform the weighted aggregation of the values
        v = self.value(x)
        out = wei @ v
        return out


# Dropout 在 train 和 eval 下行为不同
d = nn.Dropout(0.5)
ones = torch.ones(10)
d.train()
print('train 模式:', d(ones))
d.eval()
print('eval  模式:', d(ones))

h = Head(8)
x = torch.randn(1, 4, n_embd)
print('Head 输出形状:', tuple(h(x).shape))
