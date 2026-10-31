from tutorial_runtime.checking import check, expect, get, ref, same, seed


@check('get_batch 返回两个 (B, T) 的整数张量')
def _(L):
    xb, yb = get(L, 'get_batch')('train')
    B, T = L['batch_size'], L['block_size']
    expect(tuple(xb.shape) == (B, T), f'x 的形状应为 (B, T) = {(B, T)}，你的是 {tuple(xb.shape)}。')
    expect(tuple(yb.shape) == (B, T), f'y 的形状应为 (B, T) = {(B, T)}，你的是 {tuple(yb.shape)}。')


@check('y 恰好是 x 整体右移一格')
def _(L):
    torch = L['torch']
    xb, yb = L['get_batch']('train')
    expect(torch.equal(yb[:, :-1], xb[:, 1:]),
           'yb[:, :-1] 应该等于 xb[:, 1:]。y 的切片要从 i+1 开始，到 i+block_size+1 结束。')


@check('同一随机种子下，train / val 两种取法都和原版逐元素相同')
def _(L):
    R = ref('gpt')
    for split in ('train', 'val'):
        seed(42)
        mine = L['get_batch'](split)
        seed(42)
        theirs = R['get_batch'](split)
        same(mine[0], theirs[0], f"get_batch('{split}') 的 x")
        same(mine[1], theirs[1], f"get_batch('{split}') 的 y")
