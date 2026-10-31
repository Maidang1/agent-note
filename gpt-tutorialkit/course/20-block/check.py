from tutorial_runtime.checking import check, copy_weights, expect, get, ref, same_forward, same_init


@check('Block 有 sa / ffwd / ln1 / ln2 四个部件，初始化和原版相同')
def _(L):
    R = ref('gpt')
    same_init(lambda: get(L, 'Block')(32, n_head=4), lambda: R['Block'](32, n_head=4), 'Block')


@check('forward 是「预归一化 + 两次残差」，eval / train 模式都和原版相同')
def _(L):
    R = ref('gpt')
    mine, theirs = L['Block'](32, n_head=4), R['Block'](32, n_head=4)
    copy_weights(mine, theirs, 'Block')
    x = R['torch'].randn(2, 6, 32)
    same_forward(mine, theirs, (x,), 'Block', train=False)
    same_forward(mine, theirs, (x,), 'Block', train=True)


@check('两个子层的输出为 0 时，Block 原样传出输入（残差连接）')
def _(L):
    torch = L['torch']
    block = L['Block'](32, n_head=4)
    block.eval()
    with torch.no_grad():
        block.sa.proj.weight.zero_()
        block.sa.proj.bias.zero_()
        block.ffwd.net[2].weight.zero_()
        block.ffwd.net[2].bias.zero_()
    x = torch.randn(2, 6, 32)
    expect(torch.allclose(block(x), x), '子层输出为 0 时 Block 应该等于输入：两处都要写成 x = x + 子层(...)。')
