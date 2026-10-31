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
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)  # @TODO! Linear：weight 按 N(0, 0.02) 初始化；有 bias 的话置 0
            if module.bias is not None:  # @DROP
                torch.nn.init.zeros_(module.bias)  # @DROP
        elif isinstance(module, nn.Embedding):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)  # @TODO Embedding：weight 按 N(0, 0.02) 初始化

    def forward(self, idx, targets=None):
        B, T = idx.shape

        # idx and targets are both (B,T) tensor of integers
        tok_emb = self.token_embedding_table(idx) # (B,T,C)
        pos_emb = self.position_embedding_table(torch.arange(T, device=device)) # (T,C)
        x = tok_emb + pos_emb # (B,T,C)
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


class NoInit(GPTLanguageModel):
    def _init_weights(self, module):
        pass  # 什么都不做：保留 PyTorch 的默认初始化


torch.manual_seed(1)
xb, yb = ns['get_batch']('train')
for cls in (GPTLanguageModel, NoInit):
    torch.manual_seed(0)
    model = cls()
    model.eval()
    _, loss = model(xb, yb)
    std = model.lm_head.weight.std().item()
    print(f'{cls.__name__:<18} 初始 loss {loss.item():.3f}   lm_head 权重标准差 {std:.3f}')
