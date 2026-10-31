from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
torch, nn = ns['torch'], ns['nn']
n_embd, dropout = ns['n_embd'], ns['dropout']
Head = ns['Head']  # 前几课写的 Head，这里直接用原版


class MultiHeadAttention(nn.Module):
    """ multiple heads of self-attention in parallel """

    def __init__(self, num_heads, head_size):
        super().__init__()
        self.heads = TODO('num_heads 个 Head，放进 nn.ModuleList')
        self.proj = TODO('拼接后的宽度 → n_embd')
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        out = TODO('每个头各算一遍，沿最后一维拼接 → (B,T,num_heads*head_size)')
        out = TODO('先投影，再 dropout')
        return out


mha = MultiHeadAttention(num_heads=4, head_size=8)
x = torch.randn(2, 5, n_embd)
print('输入', tuple(x.shape), '→ 输出', tuple(mha(x).shape))
print('头的个数:', len(mha.heads))
print('参数个数:', sum(p.numel() for p in mha.parameters()))
