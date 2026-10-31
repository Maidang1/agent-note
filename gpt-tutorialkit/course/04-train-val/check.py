from tutorial_runtime.checking import check, expect, get, ref, same


@check('data 是整本书编码后的一维 long 张量')
def _(L):
    same(get(L, 'data'), ref('gpt')['data'], 'data')


@check('n 是前 90% 的长度')
def _(L):
    expect(get(L, 'n') == ref('gpt')['n'], f"n = {L['n']}，应为 int(0.9 * len(data))。")


@check('train_data / val_data 按 n 切开、不重叠、不打乱')
def _(L):
    R = ref('gpt')
    same(get(L, 'train_data'), R['train_data'], 'train_data')
    same(get(L, 'val_data'), R['val_data'], 'val_data')
