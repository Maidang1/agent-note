from tutorial_runtime.checking import check, copy_weights, get, ref, same_forward


def _pair(L):
    R = ref('gpt')
    mine, theirs = get(L, 'GPTLanguageModel')(), R['GPTLanguageModel']()
    copy_weights(mine, theirs, 'GPTLanguageModel')
    R['torch'].manual_seed(4)
    return mine, theirs, R['get_batch']('train')


@check('不带 targets：返回 (B, T, vocab_size) 的 logits 和 None，与原版相同')
def _(L):
    mine, theirs, (xb, _) = _pair(L)
    same_forward(mine, theirs, (xb,), 'model(xb)', train=False)


@check('带 targets：返回摊平的 logits 和 loss，train / eval 模式都与原版相同')
def _(L):
    mine, theirs, (xb, yb) = _pair(L)
    same_forward(mine, theirs, (xb, yb), 'model(xb, yb)', train=False)
    same_forward(mine, theirs, (xb, yb), 'model(xb, yb)', train=True)
