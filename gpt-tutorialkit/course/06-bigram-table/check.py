from tutorial_runtime.checking import check, expect, get, ref, same_init


@check('token_embedding_table 是 vocab_size × vocab_size 的 nn.Embedding')
def _(L):
    model = get(L, 'BigramLanguageModel')(65)
    table = getattr(model, 'token_embedding_table', None)
    expect(table is not None, '模型上没有 self.token_embedding_table：属性名要和原版一致。')
    expect(isinstance(table, L['nn'].Embedding), f'它应该是 nn.Embedding，得到 {type(table).__name__}。')
    expect(tuple(table.weight.shape) == (65, 65), f'表的形状是 {tuple(table.weight.shape)}，应为 (65, 65)。')


@check('同一随机种子下，初始权重和原版完全相同')
def _(L):
    R = ref('bigram')
    same_init(lambda: L['BigramLanguageModel'](65), lambda: R['BigramLanguageModel'](65), 'BigramLanguageModel')


@check('n_params 数对了')
def _(L):
    v = get(L, 'n_params')
    expect(v == 65 * 65, f'得到 {v}。提示：p.numel() 是一个参数张量的元素个数，把模型所有参数的加起来。')
