from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
chars = ns['chars']

# 1) 两张对照表：字符 → 编号，编号 → 字符（编号就是它在 chars 里的位置）
stoi = TODO('dict 推导式 + enumerate')
itos = TODO('反过来')

# 2) 编码 / 解码函数
encode = TODO('字符串 → 整数列表')
decode = TODO('整数列表 → 字符串')

ids = encode("hii there")
print('encode("hii there") =', ids)
print('decode(...)         =', repr(decode(ids)))
print("stoi['a'], stoi['A'], stoi[' '] =", stoi['a'], stoi['A'], stoi[' '])
