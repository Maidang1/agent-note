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
        tok_emb = self.token_embedding_table(idx)  # @TODO 字符向量 → (B,T,C)
        pos_emb = self.position_embedding_table(torch.arange(T, device=device))  # @TODO 位置 0..T-1 的向量 → (T,C)
        x = tok_emb + pos_emb  # @TODO 两者相加 → (B,T,C)
        x = self.blocks(x) # (B,T,C)
        x = self.ln_f(x) # (B,T,C)
        logits = self.lm_head(x) # (B,T,vocab_size)

        if targets is None:
            loss = None
        else:
            B, T, C = logits.shape
            logits = logits.view(B*T, C)
            targets = targets.view(B*T)
            loss = F.cross_entropy(logits, targets)

        return logits, loss


model = GPTLanguageModel()
model.eval()
idx = torch.tensor([[ns['stoi'][c] for c in 'aaaa']])
tok = model.token_embedding_table(idx)
print('四个 a 的字符向量完全相同:', all(torch.equal(tok[0, 0], tok[0, t]) for t in range(4)))
logits, _ = model(idx)
print('但模型在 4 个位置给出的打分不同:', not torch.allclose(logits[0, 0], logits[0, 3]))
