from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
chars = ns['chars']

# 1) 两张对照表：字符 → 编号，编号 → 字符（编号就是它在 chars 里的位置）
stoi = { ch:i for i,ch in enumerate(chars) }  # @TODO dict 推导式 + enumerate
itos = { i:ch for i,ch in enumerate(chars) }  # @TODO 反过来

# 2) 编码 / 解码函数
encode = lambda s: [stoi[c] for c in s]  # @TODO 字符串 → 整数列表
decode = lambda l: ''.join([itos[i] for i in l])  # @TODO 整数列表 → 字符串

ids = encode("hii there")
print('encode("hii there") =', ids)
print('decode(...)         =', repr(decode(ids)))
print("stoi['a'], stoi['A'], stoi[' '] =", stoi['a'], stoi['A'], stoi[' '])
