from tutorial_runtime.checking import (check, copy_weights, expect, get, ref, same, same_forward,
                                       same_init, seed)

CFG = dict(batch_size=16, block_size=32, max_iters=500, eval_interval=100, learning_rate=1e-3,
           eval_iters=10, n_embd=64, n_head=4, n_layer=3, dropout=0.1)


def R():
    return ref('gpt', **CFG)


@check('超参数保持骨架给定的值（判题器按这套超参数和原版比对）')
def _(L):
    changed = [f'{k}={L.get(k)!r}（应为 {v!r}）' for k, v in CFG.items() if L.get(k) != v]
    expect(not changed, '这些超参数被改动了：' + '，'.join(changed))


@check('字符表、encode / decode 和原版相同')
def _(L):
    r = R()
    expect(get(L, 'chars') == r['chars'], 'chars 和原版不同：sorted(list(set(text)))。')
    expect(get(L, 'vocab_size') == 65, f"vocab_size 是 {L['vocab_size']}，应为 65。")
    s = 'First Citizen:\nBefore we proceed'
    expect(get(L, 'encode')(s) == r['encode'](s), 'encode 的结果和原版不同。')
    ids = r['encode'](s)
    expect(get(L, 'decode')(ids) == s, 'decode(encode(s)) 没有还原出 s。')


@check('train_data / val_data 按 9:1 切分，和原版相同')
def _(L):
    r = R()
    same(get(L, 'train_data'), r['train_data'], 'train_data')
    same(get(L, 'val_data'), r['val_data'], 'val_data')


@check('get_batch：同一随机种子下，两种 split 抽出的 (x, y) 和原版相同')
def _(L):
    r = R()
    for split in ('train', 'val'):
        seed(3)
        want = r['get_batch'](split)
        seed(3)
        got = get(L, 'get_batch')(split)
        expect(isinstance(got, tuple) and len(got) == 2, 'get_batch 应返回 (x, y)。')
        same(got[0], want[0], f"get_batch('{split}') 的 x")
        same(got[1], want[1], f"get_batch('{split}') 的 y")


def _module(L, name, args, x):
    r = R()
    mine, theirs = same_init(lambda: get(L, name)(*args), lambda: r[name](*args), name)
    same_forward(mine, theirs, (x,), name, train=False)
    same_forward(mine, theirs, (x,), name, train=True)


@check('Head：初始化和前向（eval / train）与原版相同')
def _(L):
    _module(L, 'Head', (16,), L['torch'].randn(2, 6, 64))


@check('MultiHeadAttention：初始化和前向与原版相同')
def _(L):
    _module(L, 'MultiHeadAttention', (4, 16), L['torch'].randn(2, 6, 64))


@check('FeedFoward（原版就是这个拼写）：初始化和前向与原版相同')
def _(L):
    _module(L, 'FeedFoward', (64,), L['torch'].randn(2, 6, 64))


@check('Block：初始化和前向与原版相同')
def _(L):
    _module(L, 'Block', (64, 4), L['torch'].randn(2, 6, 64))


@check('GPTLanguageModel：初始化、带 / 不带 targets 的前向与原版相同')
def _(L):
    r = R()
    torch = r['torch']
    mine, theirs = same_init(lambda: get(L, 'GPTLanguageModel')(), lambda: r['GPTLanguageModel'](), 'GPTLanguageModel')
    seed(2)
    idx = torch.randint(65, (2, 12))
    targets = torch.randint(65, (2, 12))
    same_forward(mine, theirs, (idx,), 'GPTLanguageModel', train=False)
    same_forward(mine, theirs, (idx, targets), 'GPTLanguageModel', train=False)
    same_forward(mine, theirs, (idx, targets), 'GPTLanguageModel', train=True)


@check('generate：同一种子、同一权重下，生成超过 block_size 的长度，结果和原版相同')
def _(L):
    r = R()
    torch = r['torch']
    mine, theirs = get(L, 'GPTLanguageModel')(), r['GPTLanguageModel']()
    copy_weights(mine, theirs, 'GPTLanguageModel')
    ctx = torch.tensor([[0, 20, 43], [1, 39, 40]])
    seed(11)
    want = theirs.generate(ctx, max_new_tokens=40)
    seed(11)
    got = mine.generate(ctx, max_new_tokens=40)
    same(got, want, 'generate 的输出')


@check('训练后 val loss 低于 2.45（比 Bigram 的极限 ~2.49 更好）')
def _(L):
    r = R()
    r['model'] = get(L, 'model')
    val = float(r['estimate_loss']()['val'])
    expect(val < 2.45, f'用原版 estimate_loss 评估你训练后的模型，val loss 是 {val:.3f}：检查训练循环每一步是否都做了前向、zero_grad、backward、step。')


@check('estimate_loss：同一权重、同一种子下与原版相同，结束后模型回到 train 模式')
def _(L):
    r = R()
    mine, theirs = get(L, 'GPTLanguageModel')(), r['GPTLanguageModel']()
    copy_weights(mine, theirs, 'GPTLanguageModel')
    L['model'], r['model'] = mine, theirs
    seed(4)
    want = r['estimate_loss']()
    seed(4)
    got = get(L, 'estimate_loss')()
    expect(isinstance(got, dict) and set(got) == {'train', 'val'}, "estimate_loss 应返回含 'train' 和 'val' 的字典。")
    for k in ('train', 'val'):
        same(got[k], want[k], f"estimate_loss()['{k}']", atol=1e-4)
    expect(mine.training, 'estimate_loss 结束后要 model.train() 切回训练模式。')
