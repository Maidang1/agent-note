from tutorial_runtime.checking import check, expect, get, ref, seed


def _probe(L):
    """用一个会记录调用状态的模型替换学习者的全局 model，再调用 estimate_loss。"""
    R = ref('bigram', eval_iters=20)
    torch, nn = R['torch'], R['nn']

    class Probe(nn.Module):
        def __init__(self, inner):
            super().__init__()
            self.inner = inner
            self.log = []

        def forward(self, *args):
            self.log.append((torch.is_grad_enabled(), self.training))
            return self.inner(*args)

    seed(5)
    probe = Probe(R['BigramLanguageModel'](65))
    L['model'] = probe
    seed(8)
    out = get(L, 'estimate_loss')()
    return R, probe, out


@check('返回 {"train": 平均 loss, "val": 平均 loss}，每个 split 各评估 eval_iters 批')
def _(L):
    _, probe, out = _probe(L)
    expect(isinstance(out, dict) and set(out) == {'train', 'val'}, f'应返回只有 train、val 两个键的 dict，得到 {out!r}。')
    expect(len(probe.log) == 40, f'model 被调用了 {len(probe.log)} 次，应为 2 个 split × eval_iters(20) = 40 次。')


@check('评估时关闭了梯度（@torch.no_grad()）')
def _(L):
    _, probe, _ = _probe(L)
    expect(probe.log and not any(g for g, _ in probe.log),
           '评估时 torch.is_grad_enabled() 仍为 True：在 def 上方加 @torch.no_grad()。')


@check('评估时是 eval 模式，结束后切回 train 模式')
def _(L):
    _, probe, _ = _probe(L)
    expect(probe.log and not any(t for _, t in probe.log), '评估时模型还在 train 模式：循环前调用 model.eval()。')
    expect(probe.training, '函数结束后模型停在 eval 模式：return 前调用 model.train()。')


@check('同一随机种子下，两个平均 loss 和原版相同')
def _(L):
    R, probe, out = _probe(L)
    R['model'] = probe.inner
    seed(8)
    want = R['estimate_loss']()
    for split in ('train', 'val'):
        got = float(out[split])
        expect(abs(got - float(want[split])) < 1e-5, f'{split} 是 {got:.4f}，原版是 {float(want[split]):.4f}。')
