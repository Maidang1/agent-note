from tutorial_runtime.checking import check, expect, get, ref, same_init


@check('所有 Linear 的 bias 为 0，Linear / Embedding 权重的标准差约 0.02')
def _(L):
    torch, nn = L['torch'], L['nn']
    m = get(L, 'GPTLanguageModel')()
    for name, mod in m.named_modules():
        if isinstance(mod, (nn.Linear, nn.Embedding)):
            std = mod.weight.std().item()
            expect(0.012 < std < 0.03, f'{name}.weight 的标准差是 {std:.3f}，应约为 0.02。')
        if isinstance(mod, nn.Linear) and mod.bias is not None:
            expect(torch.count_nonzero(mod.bias) == 0, f'{name}.bias 应全为 0。')


@check('同一随机种子下，初始化结果和原版完全相同')
def _(L):
    R = ref('gpt')
    same_init(lambda: L['GPTLanguageModel'](), lambda: R['GPTLanguageModel'](), 'GPTLanguageModel')
