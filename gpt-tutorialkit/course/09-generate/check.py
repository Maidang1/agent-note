from tutorial_runtime.checking import check, copy_weights, expect, get, ref, same, seed


@check('generate 每轮接一个字符：(B, T) → (B, T + max_new_tokens)')
def _(L):
    model = get(L, 'BigramLanguageModel')(65)
    out = model.generate(L['torch'].zeros((2, 3), dtype=L['torch'].long), max_new_tokens=5)
    expect(out is not None, 'generate 返回了 None：最后要 return idx。')
    expect(tuple(out.shape) == (2, 8), f'输出形状 {tuple(out.shape)}，应为 (2, 3+5)。torch.cat 要沿 dim=1 拼接。')


@check('同一随机种子、同一权重下，生成的字符和原版完全相同')
def _(L):
    R = ref('bigram')
    torch = R['torch']
    mine, theirs = L['BigramLanguageModel'](65), R['BigramLanguageModel'](65)
    copy_weights(mine, theirs, 'BigramLanguageModel')
    ctx = torch.tensor([[0, 20, 43], [1, 39, 40]])
    seed(11)
    want = theirs.generate(ctx, max_new_tokens=30)
    seed(11)
    got = mine.generate(ctx, max_new_tokens=30)
    same(got, want, 'generate 的输出',)
