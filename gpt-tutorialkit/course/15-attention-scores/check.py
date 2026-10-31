from tutorial_runtime.checking import check, copy_weights, expect, get, ref, same_forward


@check('Head.forward 输出 (B, T, head_size)，且和原版相同')
def _(L):
    R = ref('gpt')
    mine, theirs = get(L, 'Head')(8), R['Head'](8)
    copy_weights(mine, theirs, 'Head')
    x = R['torch'].randn(2, 5, 32)
    same_forward(mine, theirs, (x,), 'Head', train=False)
    same_forward(mine, theirs, (x,), 'Head', train=True)


@check('缩放后点积的方差回到 1 附近')
def _(L):
    v = get(L, 'scaled').var().item()
    expect(0.8 < v < 1.2, f'缩放后的方差是 {v:.2f}：应乘以 hs ** -0.5，也就是除以 √hs。')
