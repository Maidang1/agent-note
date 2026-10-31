from tutorial_runtime import load_original, TODO
ns = load_original('gpt', overrides={
    'batch_size': 16, 'block_size': 32, 'n_embd': 64, 'n_head': 4, 'n_layer': 3,
    'max_iters': 600, 'eval_iters': 20, 'learning_rate': 1e-3,
})
torch, device = ns['torch'], ns['device']
encode, decode, get_batch = ns['encode'], ns['decode'], ns['get_batch']
GPTLanguageModel = ns['GPTLanguageModel']

# 先快速训一个模型（上一课的循环，这里直接给出）
model = GPTLanguageModel().to(device)
optimizer = torch.optim.AdamW(model.parameters(), lr=ns['learning_rate'])
for _ in range(ns['max_iters']):
    xb, yb = get_batch('train')
    _, loss = model(xb, yb)
    optimizer.zero_grad(set_to_none=True)
    loss.backward()
    optimizer.step()
print('训练结束，最后一批 loss =', round(loss.item(), 3))


@torch.no_grad()
def sample(model, prompt, max_new_tokens):
    TODO('生成前切到 eval 模式（关掉 dropout）')
    context = TODO('把 prompt 编码成 (1, T) 的 long 张量')
    out = TODO('生成')
    model.train()
    TODO('取第 0 段，解码成字符串')


print(sample(model, 'ROMEO:\n', 200))
print('=' * 30)

# 存档与读档：只存参数（state_dict），读回来时先建一个同样结构的空模型
TODO("把 model.state_dict() 存到 'gpt.pt'")
model2 = GPTLanguageModel().to(device)
TODO("从 'gpt.pt' 读回参数")
torch.manual_seed(0)
a = sample(model, 'JULIET:\n', 100)
torch.manual_seed(0)
b = sample(model2, 'JULIET:\n', 100)
print('读回的模型和原模型生成完全相同:', a == b)
