from tutorial_runtime.checking import check, expect, get, same


def _want(L):
    torch = L['torch']
    x = L['x']
    return torch.stack([x[:, :t + 1].mean(1) for t in range(x.shape[1])], dim=1)


@check('写法 1（循环）算出前缀平均')
def _(L):
    same(get(L, 'xbow1'), _want(L), 'xbow1')


@check('写法 2（下三角矩阵乘法）结果相同')
def _(L):
    same(get(L, 'xbow2'), _want(L), 'xbow2')


@check('写法 3（masked_fill + softmax）结果相同，且权重每行和为 1、上三角为 0')
def _(L):
    torch = L['torch']
    wei = get(L, 'wei')
    expect(torch.allclose(wei.sum(-1), torch.ones(8)), '权重每一行的和应为 1：softmax 要沿 dim=-1。')
    expect(torch.equal(torch.triu(wei, diagonal=1), torch.zeros(8, 8)), '上三角应全为 0：先把 tril == 0 的位置填成 -inf。')
    same(get(L, 'xbow3'), _want(L), 'xbow3')
