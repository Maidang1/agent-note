from tutorial_runtime.checking import check, expect, get, ref, same_init


@check('key / query / value 都是 n_embd → head_size、无 bias 的 Linear')
def _(L):
    h = get(L, 'Head')(8)
    for name in ('key', 'query', 'value'):
        layer = getattr(h, name, None)
        expect(layer is not None, f'没有 self.{name}。')
        expect(isinstance(layer, L['nn'].Linear), f'self.{name} 应该是 nn.Linear。')
        expect(tuple(layer.weight.shape) == (8, 32), f'self.{name}.weight 形状 {tuple(layer.weight.shape)}，应为 (head_size, n_embd) = (8, 32)。')
        expect(layer.bias is None, f'self.{name} 不应带 bias：传 bias=False。')


@check('tril 是 buffer，不是可训练参数')
def _(L):
    h = L['Head'](8)
    buffers = dict(h.named_buffers())
    expect('tril' in buffers, '没有名为 tril 的 buffer：用 self.register_buffer("tril", ...)。')
    expect(tuple(buffers['tril'].shape) == (8, 8), f'tril 形状应为 (block_size, block_size) = (8, 8)。')
    expect('tril' not in dict(h.named_parameters()), 'tril 不应该是参数。')


@check('同一随机种子下，初始化和原版完全相同（含创建顺序）')
def _(L):
    R = ref('gpt')
    same_init(lambda: L['Head'](8), lambda: R['Head'](8), 'Head')
    expect(abs(L['Head'](8).dropout.p - 0.1) < 1e-9, 'dropout 的比例应为超参数 dropout。')
