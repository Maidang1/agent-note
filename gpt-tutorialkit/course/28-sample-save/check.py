import os

from tutorial_runtime.checking import check, copy_weights, expect, get, ref, seed

CFG = dict(batch_size=16, block_size=32, n_embd=64, n_head=4, n_layer=3)


@check('sample 返回以 prompt 开头、多出 max_new_tokens 个字符的字符串')
def _(L):
    model = L['GPTLanguageModel']()
    text = get(L, 'sample')(model, 'ROMEO:', 10)
    expect(isinstance(text, str), f'sample 应返回 str，得到 {type(text).__name__}。')
    expect(text.startswith('ROMEO:') and len(text) == 16, f'得到 {text!r}：应是 prompt 加上 10 个新字符。')


@check('生成时处于 eval 模式（与原版 eval 模式下的生成完全相同），结束后切回 train')
def _(L):
    R = ref('gpt', **CFG)
    torch = R['torch']
    mine, theirs = L['GPTLanguageModel'](), R['GPTLanguageModel']()
    copy_weights(mine, theirs, 'GPTLanguageModel')
    seed(3)
    got = L['sample'](mine, 'To be', 30)
    theirs.eval()
    seed(3)
    with torch.no_grad():
        want = R['decode'](theirs.generate(torch.tensor([R['encode']('To be')]), 30)[0].tolist())
    expect(got == want, '生成结果和原版 eval 模式下不同：生成前要 model.eval()，prompt 要编码成 (1, T) 的 long 张量。')
    expect(mine.training, 'sample 结束后模型应切回 train 模式。')


@check('gpt.pt 已保存，读回的 model2 与 model 参数完全相同')
def _(L):
    expect(os.path.exists('gpt.pt'), '没有找到 gpt.pt：torch.save(model.state_dict(), "gpt.pt")。')
    torch = L['torch']
    a, b = get(L, 'model').state_dict(), get(L, 'model2').state_dict()
    expect(all(torch.equal(a[k], b[k]) for k in a), 'model2 的参数和 model 不同：用 model2.load_state_dict(torch.load("gpt.pt"))。')
