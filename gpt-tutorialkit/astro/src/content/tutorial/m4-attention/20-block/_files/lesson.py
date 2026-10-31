from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
torch, nn = ns['torch'], ns['nn']
MultiHeadAttention, FeedFoward = ns['MultiHeadAttention'], ns['FeedFoward']


class Block(nn.Module):
    """ Transformer block: communication followed by computation """

    def __init__(self, n_embd, n_head):
        # n_embd: embedding dimension, n_head: the number of heads we'd like
        super().__init__()
        head_size = TODO('每个头分到的宽度')
        self.sa = TODO('注意力：交流')
        self.ffwd = TODO('前馈：计算')
        self.ln1 = TODO('注意力之前的 LayerNorm')
        self.ln2 = TODO('前馈之前的 LayerNorm')

    def forward(self, x):
        x = TODO('先 ln1，再注意力，结果加回 x')
        x = TODO('先 ln2，再前馈，结果加回 x')
        return x


block = Block(32, n_head=4)
x = torch.randn(2, 5, 32) * 3 + 1
print('输入', tuple(x.shape), '→ 输出', tuple(block(x).shape))
ln = nn.LayerNorm(32)
y = ln(x)
print(f'LayerNorm 前：每个位置的均值 {x.mean(-1)[0, 0]:.2f}，标准差 {x.std(-1)[0, 0]:.2f}')
print(f'LayerNorm 后：每个位置的均值 {y.mean(-1)[0, 0]:.2f}，标准差 {y.std(-1)[0, 0]:.2f}')
