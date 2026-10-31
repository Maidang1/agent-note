from tutorial_runtime.checking import check, copy_weights, get, ref, same_forward


@check('eval 模式下 Head 的输出和原版相同')
def _(L):
    R = ref('gpt')
    mine, theirs = get(L, 'Head')(8), R['Head'](8)
    copy_weights(mine, theirs, 'Head')
    same_forward(mine, theirs, (R['torch'].randn(2, 6, 32),), 'Head', train=False)


@check('train 模式下（同一随机种子）也和原版相同：dropout 加在注意力权重上')
def _(L):
    R = ref('gpt')
    mine, theirs = L['Head'](8), R['Head'](8)
    copy_weights(mine, theirs, 'Head')
    same_forward(mine, theirs, (R['torch'].randn(2, 6, 32),), 'Head', train=True)
