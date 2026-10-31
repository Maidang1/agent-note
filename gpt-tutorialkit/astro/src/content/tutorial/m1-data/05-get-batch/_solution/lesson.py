from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
torch = ns['torch']
train_data, val_data = ns['train_data'], ns['val_data']
batch_size, block_size, device = ns['batch_size'], ns['block_size'], ns['device']
decode = ns['decode']


def get_batch(split):
    data = train_data if split == 'train' else val_data
    # 1) 随机抽 batch_size 个起点（每个起点后面都要留得下 block_size+1 个字符）
    ix = torch.randint(len(data) - block_size, (batch_size,))
    # 2) 每个起点往后剪 block_size 个字符，堆成 (B, T)
    x = torch.stack([data[i:i+block_size] for i in ix])
    # 3) 答案 = 同一段整体往右挪一格
    y = torch.stack([data[i+1:i+block_size+1] for i in ix])
    x, y = x.to(device), y.to(device)
    return x, y


# —— 试运行：看看第 0 行的「题目」和「答案」——
xb, yb = get_batch('train')
print('xb.shape =', tuple(xb.shape))
print('x:', repr(decode(xb[0].tolist())))
print('y:', repr(decode(yb[0].tolist())))
for t in range(block_size):
    context = xb[0, :t + 1].tolist()
    target = yb[0, t].item()
    print(f'看到 {decode(context)!r:>12} → 该猜 {decode([target])!r}')
