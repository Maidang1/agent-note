from tutorial_runtime import load_original, TODO
ns = load_original('bigram', overrides={'batch_size': 32, 'max_iters': 3000, 'eval_interval': 500, 'eval_iters': 50})
torch, get_batch, estimate_loss, decode = ns['torch'], ns['get_batch'], ns['estimate_loss'], ns['decode']
max_iters, eval_interval, learning_rate = ns['max_iters'], ns['eval_interval'], ns['learning_rate']

model = ns['BigramLanguageModel'](ns['vocab_size'])
ns['model'] = model  # 原版的 estimate_loss 读的是全局变量 model
optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)


def train():
    for iter in range(max_iters):
        # 1) 每隔 eval_interval 步，评估一次并打印
        if iter % eval_interval == 0:
            losses = estimate_loss()
            print(f"step {iter}: train loss {losses['train']:.4f}, val loss {losses['val']:.4f}")
        # 2) 抽一批训练数据
        xb, yb = get_batch('train')
        # 3) 训练一步（第 10 课的四行）
        logits, loss = model(xb, yb)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()


train()
context = torch.zeros((1, 1), dtype=torch.long)
print(decode(model.generate(context, max_new_tokens=300)[0].tolist()))
