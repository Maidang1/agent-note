from tutorial_runtime import load_original, TODO
ns = load_original('bigram')
torch, nn = ns['torch'], ns['nn']
vocab_size, stoi, itos = ns['vocab_size'], ns['stoi'], ns['itos']


class BigramLanguageModel(nn.Module):

    def __init__(self, vocab_size):
        super().__init__()
        # 一张 vocab_size × vocab_size 的可学习表：
        # 第 i 行 = 「上一个字符是 i 时，对下一个字符的 65 个打分」
        self.token_embedding_table = nn.Embedding(vocab_size, vocab_size)  # @TODO nn.Embedding(行数, 每行长度)


model = BigramLanguageModel(vocab_size)
table = model.token_embedding_table
print('表的形状:', tuple(table.weight.shape))

n_params = sum(p.numel() for p in model.parameters())  # @TODO 所有参数的元素个数之和
print('参数总数:', n_params)

# 查表：看到 'h' 时，对 65 个候选字符的打分
row = table(torch.tensor([stoi['h']]))
print("看到 'h' → 打分的形状", tuple(row.shape))
top5 = row[0].topk(5).indices.tolist()
print('现在打分最高的 5 个候选:', [itos[i] for i in top5], '（还没训练，纯随机）')
