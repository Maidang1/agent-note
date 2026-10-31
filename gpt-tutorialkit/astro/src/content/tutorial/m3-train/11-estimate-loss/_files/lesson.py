from tutorial_runtime import load_original, TODO
ns = load_original('bigram', overrides={'eval_iters': 20})
torch, get_batch, eval_iters = ns['torch'], ns['get_batch'], ns['eval_iters']

model = ns['BigramLanguageModel'](ns['vocab_size'])


TODO('这个函数只评估、不训练：在 def 上方加一个装饰器，关掉梯度计算')
def estimate_loss():
    out = {}
    TODO('切到评估模式')
    for split in ['train', 'val']:
        TODO('抽 eval_iters 批 split 数据，记下每批 loss，平均后存进 out[split]')
    TODO('切回训练模式')
    return out


losses = estimate_loss()
print(f"train loss {losses['train']:.4f}, val loss {losses['val']:.4f}")

# 只看一批会怎样？同样的模型，连抽 5 批，单批 loss 波动很大
for _ in range(5):
    xb, yb = get_batch('val')
    print('单批 val loss:', round(model(xb, yb)[1].item(), 4))
