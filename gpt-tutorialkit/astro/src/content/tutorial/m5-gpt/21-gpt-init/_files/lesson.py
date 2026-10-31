from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
torch, nn, F = ns['torch'], ns['nn'], ns['F']
vocab_size, n_embd, block_size = ns['vocab_size'], ns['n_embd'], ns['block_size']
n_head, n_layer, device = ns['n_head'], ns['n_layer'], ns['device']
Block = ns['Block']  # 第 20 课写的 Block，这里用原版


class GPTLanguageModel(nn.Module):

    def __init__(self):
        super().__init__()
        self.token_embedding_table = TODO('字符编号 → n_embd 维向量')
        self.position_embedding_table = TODO('位置 0..block_size-1 → n_embd 维向量')
        self.blocks = TODO('n_layer 个 Block 用 nn.Sequential 串起来')
        self.ln_f = TODO('最后一个 LayerNorm')
        self.lm_head = TODO('向量 → vocab_size 个打分')

        # better init, not covered in the original GPT video, but important, will cover in followup video
        self.apply(self._init_weights)

    def _init_weights(self, module):
        if isinstance(module, nn.Linear):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                torch.nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)


model = GPTLanguageModel()
total = 0
for name, child in model.named_children():
    n = sum(p.numel() for p in child.parameters())
    total += n
    print(f'{name:<26}{n:>7} 个参数')
print(f'{"合计":<24}{total:>7}')
