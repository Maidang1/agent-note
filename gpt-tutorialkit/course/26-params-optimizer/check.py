from tutorial_runtime.checking import check, expect, get


@check('本课模型的参数量')
def _(L):
    v = get(L, 'n_params')
    expect(v == 29761, f'得到 {v}，应为 29761：sum(p.numel() for p in m.parameters())。')


@check('每个 Block 的参数量公式')
def _(L):
    f = get(L, 'block_params')
    real = sum(p.numel() for p in L['Block'](32, n_head=4).parameters())
    expect(f == real, f'C=32 时公式给出 {f}，实际是 {real}。按表格把每个部件的参数加起来。')


@check('优化器是 AdamW，学习率为 learning_rate，管着模型的全部参数')
def _(L):
    torch = L['torch']
    opt = get(L, 'optimizer')
    expect(isinstance(opt, torch.optim.AdamW), f'应为 torch.optim.AdamW，得到 {type(opt).__name__}。')
    expect(abs(opt.param_groups[0]['lr'] - 3e-4) < 1e-12, f"学习率是 {opt.param_groups[0]['lr']}，应为 learning_rate=3e-4。")
    managed = {id(p) for g in opt.param_groups for p in g['params']}
    expect(managed == {id(p) for p in L['model'].parameters()}, '优化器没有拿到模型的全部参数：传 model.parameters()。')


@check('原版尺寸 GPT 的参数量')
def _(L):
    v = get(L, 'big_params')
    expect(v == 10788929, f'得到 {v}，应为 10788929（约 10.79M）。')
