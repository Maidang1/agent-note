import contextlib
import io

from tutorial_runtime.checking import check, expect, get, ref, same, seed

CFG = dict(batch_size=16, block_size=32, n_embd=64, n_head=4, n_layer=3, eval_iters=20, learning_rate=1e-3)


@check('训练后 val loss 低于 2.35（比 Bigram 的极限 ~2.49 更好）')
def _(L):
    R = ref('gpt', **CFG)
    R['model'] = get(L, 'model')
    val = float(R['estimate_loss']()['val'])
    expect(val < 2.35, f'训练后 val loss 是 {val:.3f}：检查循环里每一步是否都做了前向、zero_grad、backward、step。')


@check('同一随机种子下，6 步训练（含评估时机）与原版循环完全相同')
def _(L):
    R = ref('gpt', **{**CFG, 'eval_iters': 2})
    torch = R['torch']
    L['max_iters'], L['eval_interval'] = 6, 4
    L['ns']['eval_iters'] = 2
    seed(5)
    mine = R['GPTLanguageModel']()
    L['model'] = L['ns']['model'] = mine
    L['optimizer'] = torch.optim.AdamW(mine.parameters(), lr=1e-3)
    seed(6)
    printed = io.StringIO()
    with contextlib.redirect_stdout(printed):
        get(L, 'train')()
    n = printed.getvalue().count('step')
    expect(n == 3, f'6 步、每 4 步评估一次、最后一步也评估，应打印 step 0 / 4 / 5 共 3 行，实际 {n} 行。')

    seed(5)
    theirs = R['GPTLanguageModel']()
    R['model'] = theirs
    opt = torch.optim.AdamW(theirs.parameters(), lr=1e-3)
    seed(6)
    for it in range(6):
        if it % 4 == 0 or it == 5:
            R['estimate_loss']()
        xb, yb = R['get_batch']('train')
        _, loss = theirs(xb, yb)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()
    same(mine.lm_head.weight.detach(), theirs.lm_head.weight.detach(), '训练后的 lm_head 权重', atol=1e-4)
