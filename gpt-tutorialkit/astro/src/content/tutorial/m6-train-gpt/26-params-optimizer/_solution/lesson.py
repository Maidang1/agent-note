from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
torch, device = ns['torch'], ns['device']
n_embd, learning_rate = ns['n_embd'], ns['learning_rate']
GPTLanguageModel, Block = ns['GPTLanguageModel'], ns['Block']

model = GPTLanguageModel()
m = model.to(device)
# print the number of parameters in the model
n_params = sum(p.numel() for p in m.parameters())
print(n_params/1e6, 'M parameters')

# 每个 Block 有多少参数？试着只用 n_embd（记作 C）写出公式
C = n_embd
block_params = 12 * C**2 + 10 * C
print('公式:', block_params, ' 实际:', sum(p.numel() for p in Block(C, n_head=4).parameters()))

# create a PyTorch optimizer
optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)
print(optimizer)

# 原版尺寸的 GPT 有多大？（只建模型，不训练）
big = load_original('gpt', overrides={'n_embd': 384, 'n_head': 6, 'n_layer': 6, 'block_size': 256})
big_params = sum(p.numel() for p in big['GPTLanguageModel']().parameters())
print('原版尺寸:', round(big_params / 1e6, 2), 'M parameters')
