from tutorial_runtime.checking import check, copy_weights, get, ref, same_forward


@check('forward 和原版相同（T = block_size 和 T 更短两种情况）')
def _(L):
    R = ref('gpt')
    torch = R['torch']
    mine, theirs = get(L, 'GPTLanguageModel')(), R['GPTLanguageModel']()
    copy_weights(mine, theirs, 'GPTLanguageModel')
    for T in (8, 3):
        idx = torch.randint(65, (2, T))
        same_forward(mine, theirs, (idx,), f'model(idx)（T={T}）', train=False)
        same_forward(mine, theirs, (idx,), f'model(idx)（T={T}）', train=True)
