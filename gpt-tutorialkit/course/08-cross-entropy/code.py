from tutorial_runtime import load_original, TODO
import math
ns = load_original('bigram')
torch, nn, F = ns['torch'], ns['nn'], ns['F']
vocab_size, get_batch = ns['vocab_size'], ns['get_batch']


class BigramLanguageModel(nn.Module):

    def __init__(self, vocab_size):
        super().__init__()
        self.token_embedding_table = nn.Embedding(vocab_size, vocab_size)

    def forward(self, idx, targets=None):
        logits = self.token_embedding_table(idx)  # (B,T,C)

        if targets is None:
            loss = None
        else:
            # F.cross_entropy 要求打分是 (N, C)、答案是 (N,)，所以先把 B 和 T 两维摊平
            B, T, C = logits.shape  # @TODO 从 logits.shape 拆出三个维度
            logits = logits.view(B*T, C)  # @TODO 摊平成 (B*T, C)
            targets = targets.view(B*T)  # @TODO 摊平成 (B*T,)
            loss = F.cross_entropy(logits, targets)  # @TODO F.cross_entropy(打分, 答案)

        return logits, loss


model = BigramLanguageModel(vocab_size)
xb, yb = get_batch('train')
logits, loss = model(xb, yb)
print('摊平后 logits:', tuple(logits.shape), ' loss =', round(loss.item(), 4))

# 手算一遍交叉熵：softmax 变成概率 → 取每行「正确答案」那一格 → -log → 平均
targets = yb.view(-1)
probs = F.softmax(logits, dim=-1)
p_correct = probs[torch.arange(len(targets)), targets]  # @TODO 第 i 行取第 targets[i] 列
manual_loss = -torch.log(p_correct).mean()  # @TODO -log 再取平均
print('手算 loss =', round(manual_loss.item(), 4))
print('瞎猜（65 选 1 均匀分布）的 loss = ln(65) =', round(math.log(vocab_size), 4))
