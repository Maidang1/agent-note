from tutorial_runtime import load_original, TODO
ns = load_original('bigram')
torch, nn = ns['torch'], ns['nn']
vocab_size, get_batch, decode = ns['vocab_size'], ns['get_batch'], ns['decode']


class BigramLanguageModel(nn.Module):

    def __init__(self, vocab_size):
        super().__init__()
        self.token_embedding_table = nn.Embedding(vocab_size, vocab_size)

    def forward(self, idx, targets=None):
        # idx 是 (B, T) 的字符编号。每个编号查表取出一行 65 个打分 → (B, T, vocab_size)
        logits = self.token_embedding_table(idx)  # @TODO 把整个 idx 交给查表层
        loss = None  # 下一课再算 loss
        return logits, loss


model = BigramLanguageModel(vocab_size)
xb, yb = get_batch('train')
logits, _ = model(xb)
print('xb 形状     :', tuple(xb.shape))
print('logits 形状 :', tuple(logits.shape))

# 同一个字符，不管出现在哪一段、哪个位置，查到的都是同一行
first = xb[0, 0].item()
print(f'第 0 段第 0 个字符是 {decode([first])!r}，它的打分就是表的第 {first} 行：',
      torch.equal(logits[0, 0], model.token_embedding_table.weight[first]))
