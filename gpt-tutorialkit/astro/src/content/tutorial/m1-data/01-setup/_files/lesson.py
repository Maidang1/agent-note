from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
torch = ns['torch']

# 原版 gpt.py 第 6–16 行的超参数（原作者在 GPU 上训练约 15 分钟）
original = {'batch_size': 64, 'block_size': 256, 'max_iters': 5000, 'n_embd': 384,
            'n_head': 6, 'n_layer': 6, 'dropout': 0.2}
print('device =', ns['device'])
print(f"{'超参数':<12}{'原版':>8}{'本课':>8}")
for k, v in original.items():
    print(f'{k:<14}{v:>8}{ns[k]:>8}')

# 1) 训练一步，模型要做多少道「猜下一个字符」的题？
tokens_per_step = TODO('本课的 batch_size × block_size')
original_tokens_per_step = TODO('同上，换成 original 里的值')
print('每步练习题：本课', tokens_per_step, '道，原版', original_tokens_per_step, '道')

# 2) 注意力会把 n_embd 平均分给 n_head 个头，每个头分到多宽？
head_size = TODO('用整除 //')
print('head_size =', head_size)

# 3) 随机种子：同一个种子 → 同一串随机数。让 a 和 b 完全相同
torch.manual_seed(1337)
a = torch.randint(10, (2, 5))
TODO('在第二次抽样前做同一件事')
b = torch.randint(10, (2, 5))
print(a, b, sep='\n')
print('a 和 b 相同：', torch.equal(a, b))
