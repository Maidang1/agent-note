import contextlib
import io

from tutorial_runtime.checking import check, expect, get, ref, same, seed


@check('训练后 val loss 明显下降（< 2.7）')
def _(L):
    R = ref('bigram', eval_iters=50)
    R['model'] = get(L, 'model')
    val = float(R['estimate_loss']()['val'])
    expect(val < 2.7, f'训练后 val loss 还有 {val:.3f}：确认循环里每一步都做了前向、zero_grad、backward、step。')


@check('同一随机种子下，40 步训练后的权重与原版循环完全相同（含评估的时机）')
def _(L):
    R = ref('bigram', batch_size=32, eval_iters=5)
    torch = R['torch']
    L['max_iters'], L['eval_interval'] = 40, 20
    L['ns']['eval_iters'] = 5
    seed(5)
    mine = R['BigramLanguageModel'](65)
    L['model'] = L['ns']['model'] = mine
    L['optimizer'] = torch.optim.AdamW(mine.parameters(), lr=1e-2)
    seed(6)
    printed = io.StringIO()
    with contextlib.redirect_stdout(printed):
        get(L, 'train')()
    expect(printed.getvalue().count('step') == 2,
           f'40 步、每 20 步评估一次，应打印 2 行 step，实际打印了 {printed.getvalue().count("step")} 行。')

    seed(5)
    theirs = R['BigramLanguageModel'](65)
    R['model'] = theirs
    opt = torch.optim.AdamW(theirs.parameters(), lr=1e-2)
    seed(6)
    for it in range(40):
        if it % 20 == 0:
            R['estimate_loss']()
        xb, yb = R['get_batch']('train')
        _, loss = theirs(xb, yb)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()
    same(mine.token_embedding_table.weight.detach(), theirs.token_embedding_table.weight.detach(), '训练后的权重', atol=1e-4)
