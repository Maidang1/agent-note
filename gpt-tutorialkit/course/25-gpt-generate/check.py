from tutorial_runtime.checking import check, copy_weights, expect, get, ref, same, seed


@check('能生成超过 block_size 的长度')
def _(L):
    torch = L['torch']
    model = get(L, 'GPTLanguageModel')()
    out = model.generate(torch.zeros((2, 1), dtype=torch.long), max_new_tokens=20)
    expect(tuple(out.shape) == (2, 21), f'输出形状 {tuple(out.shape)}，应为 (2, 21)。')


@check('同一随机种子、同一权重下，生成结果和原版完全相同')
def _(L):
    R = ref('gpt')
    torch = R['torch']
    mine, theirs = L['GPTLanguageModel'](), R['GPTLanguageModel']()
    copy_weights(mine, theirs, 'GPTLanguageModel')
    ctx = torch.tensor([[0, 20, 43], [1, 39, 40]])
    seed(11)
    want = theirs.generate(ctx, max_new_tokens=15)
    seed(11)
    got = mine.generate(ctx, max_new_tokens=15)
    same(got, want, 'generate 的输出')
