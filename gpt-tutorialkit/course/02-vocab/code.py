from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
text = ns['text']  # 原版第 22–23 行读进来的整本莎士比亚

print('总字符数:', len(text))
print(text[:200])
print('-' * 40)

# 1) 文中出现过的所有不同字符，排好序放进一个 list
chars = sorted(list(set(text)))  # @TODO 先用 set 去重，再 sorted 排序
# 2) 字符表有多大
vocab_size = len(chars)  # @TODO

print('字符表:', repr(''.join(chars)))
print('vocab_size =', vocab_size)
