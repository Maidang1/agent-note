from tutorial_runtime import load_original, TODO
ns = load_original('gpt')
torch, F = ns['torch'], ns['F']

torch.manual_seed(1337)
B, T, C = 4, 8, 2
x = torch.randn(B, T, C)
# 目标：xbow[b, t] = x[b, 0], x[b, 1], ..., x[b, t] 的平均 —— 每个位置只汇总自己和之前的位置

# 写法 1：两层循环，最直白
xbow1 = torch.zeros((B, T, C))
for b in range(B):
    for t in range(T):
        xprev = x[b, :t+1]  # @TODO 第 b 段的第 0..t 个位置 → (t+1, C)
        xbow1[b, t] = torch.mean(xprev, 0)  # @TODO 沿第 0 维求平均

# 写法 2：一次矩阵乘法
wei = torch.tril(torch.ones(T, T))
wei = wei / wei.sum(1, keepdim=True)  # @TODO 每一行除以这一行的和
xbow2 = wei @ x  # @TODO (T, T) @ (B, T, C) → (B, T, C)
print('写法 2 的权重矩阵：')
print(wei)

# 写法 3：先填 -inf 再 softmax —— 这就是注意力用的形式
tril = torch.tril(torch.ones(T, T))
wei = torch.zeros((T, T))
wei = wei.masked_fill(tril == 0, float('-inf'))  # @TODO 上三角（「未来」）填成 -inf
wei = F.softmax(wei, dim=-1)  # @TODO 每一行做 softmax
xbow3 = wei @ x

print('写法 1 == 写法 2:', torch.allclose(xbow1, xbow2))
print('写法 1 == 写法 3:', torch.allclose(xbow1, xbow3))
