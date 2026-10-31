from tutorial_runtime import load_original, TODO
ns = load_original('bigram', overrides={'eval_iters': 20})
torch, get_batch, eval_iters = ns['torch'], ns['get_batch'], ns['eval_iters']

model = ns['BigramLanguageModel'](ns['vocab_size'])


@torch.no_grad()
def estimate_loss():
    out = {}
    model.eval()
    for split in ['train', 'val']:
        losses = torch.zeros(eval_iters)
        for k in range(eval_iters):
            X, Y = get_batch(split)
            logits, loss = model(X, Y)
            losses[k] = loss.item()
        out[split] = losses.mean()
    model.train()
    return out


losses = estimate_loss()
print(f"train loss {losses['train']:.4f}, val loss {losses['val']:.4f}")

# 只看一批会怎样？同样的模型，连抽 5 批，单批 loss 波动很大
for _ in range(5):
    xb, yb = get_batch('val')
    print('单批 val loss:', round(model(xb, yb)[1].item(), 4))
