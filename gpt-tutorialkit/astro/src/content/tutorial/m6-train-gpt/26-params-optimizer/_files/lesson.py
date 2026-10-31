from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
torch, device = ns['torch'], ns['device']
n_embd, learning_rate = ns['n_embd'], ns['learning_rate']
GPTLanguageModel, Block = ns['GPTLanguageModel'], ns['Block']

model = GPTLanguageModel()
m = TODO('把模型搬到 device 上')
# print the number of parameters in the model
n_params = TODO('所有参数的元素个数之和')
print(n_params/1e6, 'M parameters')

# 每个 Block 有多少参数？试着只用 n_embd（记作 C）写出公式
C = n_embd
block_params = TODO('用 C 写公式：注意力 q/k/v + proj、前馈两层、两个 LayerNorm')
print('公式:', block_params, ' 实际:', sum(p.numel() for p in Block(C, n_head=4).parameters()))

# create a PyTorch optimizer
optimizer = TODO('AdamW，学习率用 learning_rate')
print(optimizer)

# 原版尺寸的 GPT 有多大？（只建模型，不训练）
big = load_original('gpt', overrides={'n_embd': 384, 'n_head': 6, 'n_layer': 6, 'block_size': 256})
big_params = TODO('同样数一遍')
print('原版尺寸:', round(big_params / 1e6, 2), 'M parameters')
