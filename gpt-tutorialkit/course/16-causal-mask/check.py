from tutorial_runtime.checking import check, copy_weights, expect, get, ref, same_forward


@check('位置 t 的输出只取决于 0..t 的输入（看不到未来）')
def _(L):
    torch = L['torch']
    h = get(L, 'Head')(8)
    h.eval()
    x = torch.randn(2, 7, 32)
    for t in range(1, 7):
        x2 = x.clone()
        x2[:, t:] = torch.randn(2, 7 - t, 32)
        a, b = h(x), h(x2)
        expect(not torch.isnan(a).any(), '输出里出现了 nan：-inf 应该只填在上三角，对角线必须保留。')
        expect(torch.allclose(a[:, :t], b[:, :t], atol=1e-6),
               f'改了第 {t} 个位置之后的输入，前 {t} 个位置的输出也变了：未来的信息漏进来了。')


@check('T 小于 block_size 时也能运行，且和原版相同')
def _(L):
    R = ref('gpt')
    mine, theirs = L['Head'](8), R['Head'](8)
    copy_weights(mine, theirs, 'Head')
    for T in (3, 8):
        x = R['torch'].randn(2, T, 32)
        same_forward(mine, theirs, (x,), f'Head（T={T}）', train=False)
        same_forward(mine, theirs, (x,), f'Head（T={T}）', train=True)
