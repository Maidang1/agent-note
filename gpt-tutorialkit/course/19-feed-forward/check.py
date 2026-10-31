from tutorial_runtime.checking import check, copy_weights, expect, get, ref, same_forward, same_init


@check('self.net 依次是 Linear(32→128)、ReLU、Linear(128→32)、Dropout')
def _(L):
    nn = L['nn']
    net = getattr(get(L, 'FeedFoward')(32), 'net', None)
    expect(isinstance(net, nn.Sequential), 'self.net 应该是 nn.Sequential。')
    kinds = [type(m).__name__ for m in net]
    expect(kinds == ['Linear', 'ReLU', 'Linear', 'Dropout'], f'层的顺序是 {kinds}，应为 Linear、ReLU、Linear、Dropout。')
    expect((net[0].in_features, net[0].out_features) == (32, 128), '第一个 Linear 应把 n_embd 扩到 4 * n_embd。')
    expect((net[2].in_features, net[2].out_features) == (128, 32), '第二个 Linear 应把 4 * n_embd 压回 n_embd。')


@check('同一随机种子下，初始化和 forward 都和原版相同')
def _(L):
    R = ref('gpt')
    mine, theirs = same_init(lambda: L['FeedFoward'](32), lambda: R['FeedFoward'](32), 'FeedFoward')
    copy_weights(mine, theirs, 'FeedFoward')
    x = R['torch'].randn(2, 6, 32)
    same_forward(mine, theirs, (x,), 'FeedFoward', train=False)
    same_forward(mine, theirs, (x,), 'FeedFoward', train=True)
