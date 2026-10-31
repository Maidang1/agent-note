from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
torch, nn = ns['torch'], ns['nn']
MultiHeadAttention, FeedFoward = ns['MultiHeadAttention'], ns['FeedFoward']


class Block(nn.Module):
    """ Transformer block: communication followed by computation """

    def __init__(self, n_embd, n_head):
        # n_embd: embedding dimension, n_head: the number of heads we'd like
        super().__init__()
        head_size = n_embd // n_head
        self.sa = MultiHeadAttention(n_head, head_size)
        self.ffwd = FeedFoward(n_embd)
        self.ln1 = nn.LayerNorm(n_embd)
        self.ln2 = nn.LayerNorm(n_embd)

    def forward(self, x):
        x = x + self.sa(self.ln1(x))
        x = x + self.ffwd(self.ln2(x))
        return x


block = Block(32, n_head=4)
x = torch.randn(2, 5, 32) * 3 + 1
print('输入', tuple(x.shape), '→ 输出', tuple(block(x).shape))
ln = nn.LayerNorm(32)
y = ln(x)
print(f'LayerNorm 前：每个位置的均值 {x.mean(-1)[0, 0]:.2f}，标准差 {x.std(-1)[0, 0]:.2f}')
print(f'LayerNorm 后：每个位置的均值 {y.mean(-1)[0, 0]:.2f}，标准差 {y.std(-1)[0, 0]:.2f}')
