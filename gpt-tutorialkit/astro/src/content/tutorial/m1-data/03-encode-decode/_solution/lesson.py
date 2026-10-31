from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
chars = ns['chars']

# 1) 两张对照表：字符 → 编号，编号 → 字符（编号就是它在 chars 里的位置）
stoi = { ch:i for i,ch in enumerate(chars) }
itos = { i:ch for i,ch in enumerate(chars) }

# 2) 编码 / 解码函数
encode = lambda s: [stoi[c] for c in s]
decode = lambda l: ''.join([itos[i] for i in l])

ids = encode("hii there")
print('encode("hii there") =', ids)
print('decode(...)         =', repr(decode(ids)))
print("stoi['a'], stoi['A'], stoi[' '] =", stoi['a'], stoi['A'], stoi[' '])
