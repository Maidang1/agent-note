from tutorial_runtime.checking import check, copy_weights, get, ref, same_forward, seed


@check('forward 返回 (B, T, vocab_size) 的 logits，且和原版相同')
def _(L):
    R = ref('bigram')
    mine, theirs = get(L, 'BigramLanguageModel')(65), R['BigramLanguageModel'](65)
    copy_weights(mine, theirs, 'BigramLanguageModel')
    seed(3)
    xb, _ = R['get_batch']('train')
    same_forward(mine, theirs, (xb,), 'model(xb)')
