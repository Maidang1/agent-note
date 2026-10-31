from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
torch, text, encode = ns['torch'], ns['text'], ns['encode']

# 1) 整本书编码成一个一维的整数张量（dtype 用 torch.long）
data = torch.tensor(encode(text), dtype=torch.long)  # @TODO torch.tensor(..., dtype=torch.long)
print('data:', data.shape, data.dtype)
print('前 20 个:', data[:20].tolist())

# 2) 前 90% 当训练集，后 10% 当验证集
n = int(0.9*len(data))  # @TODO 前 90% 的长度（取整）
train_data = data[:n]  # @TODO
val_data = data[n:]  # @TODO
print('train:', len(train_data), ' val:', len(val_data))
