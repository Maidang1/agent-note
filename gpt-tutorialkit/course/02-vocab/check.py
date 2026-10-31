from tutorial_runtime.checking import check, expect, get, ref


@check('chars 是排好序、不重复的字符列表')
def _(L):
    chars = get(L, 'chars')
    expect(isinstance(chars, list), f'chars 应该是 list，得到 {type(chars).__name__}：sorted(...) 会返回 list。')
    expect(len(set(chars)) == len(chars), 'chars 里有重复字符：先用 set(text) 去重。')
    expect(chars == sorted(chars), 'chars 没有排序：用 sorted(...)。')
    expect(chars == ref('gpt')['chars'], 'chars 和原版不同：应该包含 text 里出现过的每一个字符。')


@check('vocab_size 是字符表大小')
def _(L):
    v = get(L, 'vocab_size')
    expect(v == len(L['chars']) == 65, f'得到 {v}，应为 len(chars)，也就是 65。')
