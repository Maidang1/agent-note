from tutorial_runtime.checking import check, copy_weights, expect, get, ref, same_forward, same_init


@check('heads 是装着 num_heads 个 Head 的 nn.ModuleList')
def _(L):
    mha = get(L, 'MultiHeadAttention')(4, 8)
    heads = getattr(mha, 'heads', None)
    expect(isinstance(heads, L['nn'].ModuleList),
           'self.heads 应是 nn.ModuleList：普通 list 里的子模块不会被登记，参数就不会被训练。')
    expect(len(heads) == 4, f'应有 4 个头，得到 {len(heads)} 个。')


@check('同一随机种子下，初始化和原版完全相同')
def _(L):
    R = ref('gpt')
    same_init(lambda: L['MultiHeadAttention'](4, 8), lambda: R['MultiHeadAttention'](4, 8), 'MultiHeadAttention')


@check('forward 在 eval / train 模式下都和原版相同')
def _(L):
    R = ref('gpt')
    mine, theirs = L['MultiHeadAttention'](4, 8), R['MultiHeadAttention'](4, 8)
    copy_weights(mine, theirs, 'MultiHeadAttention')
    x = R['torch'].randn(2, 6, 32)
    same_forward(mine, theirs, (x,), 'MultiHeadAttention', train=False)
    same_forward(mine, theirs, (x,), 'MultiHeadAttention', train=True)
