from tutorial_runtime.checking import check, expect, get


@check('本课每步的练习题数 = batch_size × block_size')
def _(L):
    v = get(L, 'tokens_per_step')
    expect(v == 4 * 8, f'得到 {v}。本课 batch_size=4、block_size=8，应为 32。')


@check('原版每步的练习题数')
def _(L):
    v = get(L, 'original_tokens_per_step')
    expect(v == 64 * 256, f'得到 {v}。原版 batch_size=64、block_size=256。')


@check('每个注意力头的宽度 head_size')
def _(L):
    v = get(L, 'head_size')
    expect(isinstance(v, int), f'head_size 应该是整数，得到 {type(v).__name__}：用 // 而不是 /。')
    expect(v == 32 // 4, f'得到 {v}。本课 n_embd=32、n_head=4。')


@check('重设种子后两次随机抽样完全相同')
def _(L):
    expect(L['torch'].equal(get(L, 'a'), get(L, 'b')),
           'a 和 b 不同。第二次 randint 之前也要调用 torch.manual_seed(1337)。')
