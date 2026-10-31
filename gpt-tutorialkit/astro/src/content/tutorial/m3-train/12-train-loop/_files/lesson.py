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
        TODO('每隔 eval_interval 步：estimate_loss() 并打印 train / val loss')
        # 2) 抽一批训练数据
        xb, yb = TODO('get_batch(...)')
        # 3) 训练一步（第 10 课的四行）
        TODO('前向、清梯度、反向、更新')


train()
context = torch.zeros((1, 1), dtype=torch.long)
TODO('从 context 生成 300 个字符，decode 后打印')
