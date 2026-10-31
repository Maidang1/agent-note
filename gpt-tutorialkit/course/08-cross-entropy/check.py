from tutorial_runtime.checking import check, copy_weights, expect, get, ref, same, same_forward, seed


def _models(L):
    R = ref('bigram')
    mine, theirs = get(L, 'BigramLanguageModel')(65), R['BigramLanguageModel'](65)
    copy_weights(mine, theirs, 'BigramLanguageModel')
    seed(3)
    return mine, theirs, R['get_batch']('train')


@check('带 targets 时：返回摊平的 logits 和与原版相同的 loss')
def _(L):
    mine, theirs, (xb, yb) = _models(L)
    same_forward(mine, theirs, (xb, yb), 'model(xb, yb)')


@check('不带 targets 时：logits 保持 (B, T, C)，loss 为 None')
def _(L):
    mine, theirs, (xb, _) = _models(L)
    same_forward(mine, theirs, (xb,), 'model(xb)')


@check('手算的交叉熵和 F.cross_entropy 一致')
def _(L):
    same(get(L, 'p_correct').detach(), L['F'].softmax(L['logits'], -1)[L['torch'].arange(32), L['targets']].detach(),
         'p_correct')
    m, l = get(L, 'manual_loss'), L['loss']
    expect(abs(m.item() - l.item()) < 1e-5, f'手算 {m.item():.4f}，F.cross_entropy 是 {l.item():.4f}：-log 之后要取 mean。')
