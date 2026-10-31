from tutorial_runtime.checking import check, expect, get, ref


@check('stoi / itos 两张表和原版一致')
def _(L):
    R = ref('gpt')
    expect(get(L, 'stoi') == R['stoi'], 'stoi 和原版不同：键是字符，值是它在 chars 里的下标。')
    expect(get(L, 'itos') == R['itos'], 'itos 和原版不同：键是下标，值是字符。')


@check('encode 把字符串变成整数列表')
def _(L):
    out = get(L, 'encode')('hii there')
    expect(isinstance(out, list), f'encode 应返回 list，得到 {type(out).__name__}。')
    expect(out == ref('gpt')['encode']('hii there'), f'encode("hii there") 得到 {out}，和原版不同。')


@check('decode(encode(s)) 能还原整段原文')
def _(L):
    s = L['text'] if 'text' in L else ref('gpt')['text']
    sample = s[:5000]
    back = get(L, 'decode')(L['encode'](sample))
    expect(isinstance(back, str), f'decode 应返回 str，得到 {type(back).__name__}：用 "".join(...)。')
    expect(back == sample, 'decode 之后和原文对不上。')
