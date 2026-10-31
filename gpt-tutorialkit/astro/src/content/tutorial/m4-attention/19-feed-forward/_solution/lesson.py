from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
torch, nn = ns['torch'], ns['nn']
n_embd, dropout = ns['n_embd'], ns['dropout']


class FeedFoward(nn.Module):  # 原版的拼写就是 FeedFoward，保持一致
    """ a simple linear layer followed by a non-linearity """

    def __init__(self, n_embd):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_embd, 4 * n_embd),
            nn.ReLU(),
            nn.Linear(4 * n_embd, n_embd),
            nn.Dropout(dropout),
        )

    def forward(self, x):
        return self.net(x)


ff = FeedFoward(n_embd)
x = torch.randn(2, 5, n_embd)
print('输入', tuple(x.shape), '→ 输出', tuple(ff(x).shape))
print(ff.net)

# 逐位置：改动第 0 个位置的输入，其他位置的输出完全不受影响
ff.eval()
x2 = x.clone()
x2[:, 0] = torch.randn(2, n_embd)
print('其他位置不受影响:', torch.allclose(ff(x)[:, 1:], ff(x2)[:, 1:]))
