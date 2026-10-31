from tutorial_runtime import load_original, TODO
ns = load_original('bigram')
torch, nn, F = ns['torch'], ns['nn'], ns['F']
vocab_size, decode = ns['vocab_size'], ns['decode']


class BigramLanguageModel(nn.Module):

    def __init__(self, vocab_size):
        super().__init__()
        self.token_embedding_table = nn.Embedding(vocab_size, vocab_size)

    def forward(self, idx, targets=None):
        logits = self.token_embedding_table(idx)
        if targets is None:
            loss = None
        else:
            B, T, C = logits.shape
            logits = logits.view(B*T, C)
            targets = targets.view(B*T)
            loss = F.cross_entropy(logits, targets)
        return logits, loss

    def generate(self, idx, max_new_tokens):
        # idx 是 (B, T) 的已有上文；每轮生成一个新字符接到末尾
        for _ in range(max_new_tokens):
            logits, loss = self(idx)  # @TODO 对当前上文做一次 forward
            logits = logits[:, -1, :]  # @TODO 只要最后一个位置的打分 → (B, C)
            probs = F.softmax(logits, dim=-1)  # @TODO 打分 → 概率
            idx_next = torch.multinomial(probs, num_samples=1)  # @TODO 按概率抽一个 → (B, 1)
            idx = torch.cat((idx, idx_next), dim=1)  # @TODO 接到末尾 → (B, T+1)
        return idx


model = BigramLanguageModel(vocab_size)
context = torch.zeros((1, 1), dtype=torch.long)  # 编号 0 是换行符，从一个空行开始写
out = model.generate(context, max_new_tokens=200)
print('形状:', tuple(out.shape))
print(decode(out[0].tolist()))
