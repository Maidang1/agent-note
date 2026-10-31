from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
torch, nn, F = ns['torch'], ns['nn'], ns['F']
vocab_size, n_embd, block_size = ns['vocab_size'], ns['n_embd'], ns['block_size']
n_head, n_layer, device = ns['n_head'], ns['n_layer'], ns['device']
Block = ns['Block']  # 第 20 课写的 Block，这里用原版


class GPTLanguageModel(nn.Module):

    def __init__(self):
        super().__init__()
        # each token directly reads off the logits for the next token from a lookup table
        self.token_embedding_table = nn.Embedding(vocab_size, n_embd)
        self.position_embedding_table = nn.Embedding(block_size, n_embd)
        self.blocks = nn.Sequential(*[Block(n_embd, n_head=n_head) for _ in range(n_layer)])
        self.ln_f = nn.LayerNorm(n_embd) # final layer norm
        self.lm_head = nn.Linear(n_embd, vocab_size)

        # better init, not covered in the original GPT video, but important, will cover in followup video
        self.apply(self._init_weights)

    def _init_weights(self, module):
        if isinstance(module, nn.Linear):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                torch.nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(self, idx, targets=None):
        B, T = idx.shape

        # idx and targets are both (B,T) tensor of integers
        tok_emb = self.token_embedding_table(idx) # (B,T,C)
        pos_emb = self.position_embedding_table(torch.arange(T, device=device)) # (T,C)
        x = tok_emb + pos_emb # (B,T,C)
        x = TODO('依次穿过所有 Block')
        x = TODO('最后的 LayerNorm')
        logits = TODO('映射成 vocab_size 个打分 → (B,T,vocab_size)')

        TODO('和 Bigram 完全一样：没有 targets 时 loss=None，否则摊平后算交叉熵')

        return logits, loss


model = GPTLanguageModel()
xb, yb = ns['get_batch']('train')
logits, loss = model(xb)
print('不带 targets：logits', tuple(logits.shape), ' loss =', loss)
logits, loss = model(xb, yb)
print('带 targets  ：logits', tuple(logits.shape), ' loss =', round(loss.item(), 4))
