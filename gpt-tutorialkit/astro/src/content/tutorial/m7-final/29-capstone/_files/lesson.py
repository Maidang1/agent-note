# 结业：不看前面的课，从这个骨架写出完整的 gpt.py。
# 超参数按本机 CPU 调小了，判题器会用同一套超参数和原版逐项比对，请不要改动。
import torch
import torch.nn as nn
from torch.nn import functional as F
from tutorial_runtime import CORPUS, TODO

# hyperparameters
batch_size = 16
block_size = 32
max_iters = 500
eval_interval = 100
learning_rate = 1e-3
device = 'cpu'
eval_iters = 10
n_embd = 64
n_head = 4
n_layer = 3
dropout = 0.1
# ------------

torch.manual_seed(1337)

with open(CORPUS, 'r', encoding='utf-8') as f:
    text = f.read()

# here are all the unique characters that occur in this text
chars = TODO('所有出现过的字符，去重并排序（第 2 课）')
vocab_size = TODO('字符表大小')
# create a mapping from characters to integers
stoi = TODO('字符 → 编号（第 3 课）')
itos = TODO('编号 → 字符')
encode = TODO('字符串 → 编号列表')
decode = TODO('编号列表 → 字符串')

# Train and test splits
data = TODO('整本书编码成 long 张量（第 4 课）')
n = TODO('前 90% 训练')
train_data = TODO('前 n 个')
val_data = TODO('剩下的')

# data loading
def get_batch(split):
    TODO('随机切出 batch_size 段长 block_size 的 x，y 往后错一位（第 5 课）')

@torch.no_grad()
def estimate_loss():
    TODO("eval 模式下各取 eval_iters 批算平均 loss，返回 {'train': ..., 'val': ...}，最后切回 train（第 11 课）")

class Head(nn.Module):
    """ one head of self-attention """

    def __init__(self, head_size):
        super().__init__()
        TODO('key / query / value、tril buffer、dropout（第 14 课）')

    def forward(self, x):
        TODO('缩放打分 → 因果遮罩 → softmax → dropout → 加权求和 value（第 15–17 课）')

class MultiHeadAttention(nn.Module):
    """ multiple heads of self-attention in parallel """

    def __init__(self, num_heads, head_size):
        super().__init__()
        TODO('heads、proj、dropout（第 18 课）')

    def forward(self, x):
        TODO('各头输出拼起来，过 proj 和 dropout')

class FeedFoward(nn.Module):
    """ a simple linear layer followed by a non-linearity """

    def __init__(self, n_embd):
        super().__init__()
        TODO('self.net：放大 4 倍 → ReLU → 缩回 → Dropout（第 19 课）')

    def forward(self, x):
        return self.net(x)

class Block(nn.Module):
    """ Transformer block: communication followed by computation """

    def __init__(self, n_embd, n_head):
        super().__init__()
        TODO('sa、ffwd、ln1、ln2，注意创建顺序（第 20 课）')

    def forward(self, x):
        TODO('预归一化 + 两次残差')

class GPTLanguageModel(nn.Module):

    def __init__(self):
        super().__init__()
        TODO('两张嵌入表、n_layer 个 Block、ln_f、lm_head（第 21 课）')
        TODO('对所有子模块应用 _init_weights')

    def _init_weights(self, module):
        TODO('Linear 和 Embedding 的权重 N(0, 0.02)，Linear 的 bias 置 0（第 22 课）')

    def forward(self, idx, targets=None):
        TODO('嵌入相加 → blocks → ln_f → lm_head；有 targets 时展平算交叉熵（第 23–24 课）')

    def generate(self, idx, max_new_tokens):
        TODO('每步：截取最后 block_size 个 → 前向 → 取最后位置 → softmax → 采样 → 拼接（第 25 课）')

model = TODO('建模型（第 26 课）')
m = TODO('搬到 device')
print(sum(p.numel() for p in m.parameters())/1e6, 'M parameters')

optimizer = TODO('AdamW 优化器')

TODO('训练循环：定期和最后一步评估并打印，每步抽数据、前向、清梯度、反向、更新（第 27 课）')

# generate from the model
context = torch.zeros((1, 1), dtype=torch.long, device=device)
print(decode(m.generate(context, max_new_tokens=300)[0].tolist()))
