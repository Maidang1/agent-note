from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
torch, nn = ns['torch'], ns['nn']
n_embd, block_size, dropout = ns['n_embd'], ns['block_size'], ns['dropout']


class Head(nn.Module):
    """ one head of self-attention """

    def __init__(self, head_size):
        super().__init__()
        # 三个线性投影：每个位置的 n_embd 维向量 → head_size 维，都不带 bias
        self.key = TODO('key：我有什么')
        self.query = TODO('query：我在找什么')
        self.value = TODO('value：被选中时我交出什么')
        # 下三角矩阵不是参数（不训练），但要跟着模型走：用 register_buffer 登记
        TODO("register_buffer('tril', (block_size, block_size) 的下三角全 1 矩阵)")

        self.dropout = TODO('')


h = Head(8)
for name, p in h.named_parameters():
    print('参数  ', name, tuple(p.shape))
for name, b in h.named_buffers():
    print('buffer', name, tuple(b.shape))
print('可训练参数个数:', sum(p.numel() for p in h.parameters()))
print(h.tril)
