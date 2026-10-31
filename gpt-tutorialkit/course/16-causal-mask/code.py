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
        wei = wei.masked_fill(self.tril[:T, :T] == 0, float('-inf'))  # @TODO 未来位置填成 -inf（T 可能小于 block_size，只取 tril 的左上角）
        wei = F.softmax(wei, dim=-1)  # @TODO 每一行 softmax → 和为 1 的权重
        wei = self.dropout(wei)
        v = self.value(x)
        out = wei @ v
        return out


h = Head(8)
h.eval()
x = torch.randn(1, 6, n_embd)
out = h(x)

# 因果性测试：改掉第 3 个位置之后的所有输入，前 3 个位置的输出应该纹丝不动
x2 = x.clone()
x2[:, 3:] = torch.randn(1, 3, n_embd)
out2 = h(x2)
print('前 3 个位置输出不变:', torch.allclose(out[:, :3], out2[:, :3]))
print('后 3 个位置输出改变:', not torch.allclose(out[:, 3:], out2[:, 3:]))
