from tutorial_runtime.checking import check, expect, get, ref, same, seed


def _run(L, steps):
    """学习者的 train_step 与原版四步各跑 steps 步，返回两边最终权重。"""
    R = ref('bigram')
    torch = R['torch']
    seed(5)
    mine = R['BigramLanguageModel'](65)
    seed(5)
    theirs = R['BigramLanguageModel'](65)
    L['model'] = mine
    L['optimizer'] = torch.optim.AdamW(mine.parameters(), lr=1e-2)
    opt = torch.optim.AdamW(theirs.parameters(), lr=1e-2)
    seed(9)
    batches = [R['get_batch']('train') for _ in range(steps)]
    for xb, yb in batches:
        out = get(L, 'train_step')(xb, yb)
        _, loss = theirs(xb, yb)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()
    return out, loss, mine, theirs


@check('train_step 返回这一步的 loss')
def _(L):
    out, loss, _, _ = _run(L, 1)
    expect(out is not None, 'train_step 返回了 None：最后 return loss。')
    expect(abs(out.item() - loss.item()) < 1e-6, f'返回的 loss 是 {out.item():.4f}，应为 {loss.item():.4f}。')


@check('走一步之后，参数和原版的一步完全相同')
def _(L):
    _, _, mine, theirs = _run(L, 1)
    same(mine.token_embedding_table.weight.detach(), theirs.token_embedding_table.weight.detach(), '更新后的权重')


@check('连续走 5 步也和原版相同（梯度没有越攒越多）')
def _(L):
    _, _, mine, theirs = _run(L, 5)
    w_m, w_t = mine.token_embedding_table.weight.detach(), theirs.token_embedding_table.weight.detach()
    expect(L['torch'].allclose(w_m, w_t, atol=1e-5),
           '第 1 步对、多步不对，通常是忘了 optimizer.zero_grad：PyTorch 的梯度默认是累加的。')
