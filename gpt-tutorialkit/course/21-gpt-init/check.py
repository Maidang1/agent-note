from tutorial_runtime.checking import check, expect, get, ref, same_init


@check('五个部件的形状都对')
def _(L):
    m = get(L, 'GPTLanguageModel')()
    shapes = {k: tuple(v.shape) for k, v in m.state_dict().items()}
    want = {
        'token_embedding_table.weight': (65, 32),
        'position_embedding_table.weight': (8, 32),
        'ln_f.weight': (32,),
        'lm_head.weight': (65, 32),
    }
    for k, s in want.items():
        expect(shapes.get(k) == s, f'{k} 的形状是 {shapes.get(k)}，应为 {s}。')
    n_blocks = len(getattr(m, 'blocks', []))
    expect(n_blocks == 2, f'blocks 里应有 n_layer=2 个 Block，得到 {n_blocks} 个。')


@check('同一随机种子下，整个模型的初始权重和原版完全相同')
def _(L):
    R = ref('gpt')
    same_init(lambda: L['GPTLanguageModel'](), lambda: R['GPTLanguageModel'](), 'GPTLanguageModel')
