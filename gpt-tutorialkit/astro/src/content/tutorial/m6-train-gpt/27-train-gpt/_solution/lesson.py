from tutorial_runtime import load_original, TODO
# 比第 1 课的配置稍大一点，CPU 上约 12 秒训完 1000 步
ns = load_original('gpt', overrides={
    'batch_size': 16, 'block_size': 32, 'n_embd': 64, 'n_head': 4, 'n_layer': 3,
    'max_iters': 1000, 'eval_interval': 250, 'eval_iters': 20, 'learning_rate': 1e-3,
})
torch, device = ns['torch'], ns['device']
get_batch, estimate_loss, decode = ns['get_batch'], ns['estimate_loss'], ns['decode']
max_iters, eval_interval, learning_rate = ns['max_iters'], ns['eval_interval'], ns['learning_rate']

model = ns['GPTLanguageModel']()
m = model.to(device)
ns['model'] = model  # 原版 estimate_loss 读全局 model
optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)


def train():
    for iter in range(max_iters):

        # every once in a while evaluate the loss on train and val sets
        if iter % eval_interval == 0 or iter == max_iters - 1:
            losses = estimate_loss()
            print(f"step {iter}: train loss {losses['train']:.4f}, val loss {losses['val']:.4f}")

        # sample a batch of data
        xb, yb = get_batch('train')

        # evaluate the loss
        logits, loss = model(xb, yb)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()


train()
context = torch.zeros((1, 1), dtype=torch.long, device=device)
print(decode(m.generate(context, max_new_tokens=300)[0].tolist()))
