from tutorial_runtime import load_original, TODO
ns = load_original('bigram')
torch = ns['torch']
BigramLanguageModel, get_batch, decode = ns['BigramLanguageModel'], ns['get_batch'], ns['decode']

model = BigramLanguageModel(ns['vocab_size'])
optimizer = torch.optim.AdamW(model.parameters(), lr=ns['learning_rate'])


def train_step(xb, yb):
    logits, loss = model(xb, yb)  # @TODO 1) 前向：拿到 loss
    optimizer.zero_grad(set_to_none=True)  # @TODO 2) 清掉上一步留下的梯度
    loss.backward()  # @TODO 3) 反向传播：算出每个参数的梯度
    optimizer.step()  # @TODO 4) 让优化器按梯度更新参数
    return loss


xb, yb = get_batch('train')
loss = train_step(xb, yb)
print('第 1 步 loss =', round(loss.item(), 4))

grad = model.token_embedding_table.weight.grad
rows_with_grad = (grad.abs().sum(dim=1) > 0).sum().item()
print('有梯度的行数:', rows_with_grad, ' 这批 x 里出现的不同字符数:', xb.unique().numel())

# 拿同一批反复练：loss 应该一路往下掉
for step in range(2, 201):
    loss = train_step(xb, yb)
    if step % 50 == 0:
        print(f'第 {step} 步 loss =', round(loss.item(), 4))
