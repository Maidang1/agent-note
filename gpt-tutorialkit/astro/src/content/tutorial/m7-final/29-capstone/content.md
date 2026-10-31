---
type: lesson
title: "结业：闭卷写出 gpt.py"
---

## 这一课和前面有什么不同

前面每一课只空出一小块，其他部件都由 `load_original` 从原版取来。这一课右边只有一个骨架：导入、超参数、类和方法的签名都在，<strong>其余全部由你来写</strong>，不再从原版借任何东西。

判题器会像前面一样，逐个部件和原版比对：

1. 字符表、`encode` / `decode`
2. train / val 切分、`get_batch`
3. `Head` → `MultiHeadAttention` → `FeedFoward` → `Block` → `GPTLanguageModel`，比对初始化和前向
4. `generate`、`estimate_loss`
5. 训练 500 步后，val loss 要低于 2.45

每个部件单独比对。代码会在第一个还没完成的<strong>顶层</strong> TODO（比如 `chars = TODO(...)`）处停下，在它之前定义好的部件照常比对；类的方法体里的 TODO 要等真正调用时才会报错，不影响类本身被定义。

## 建议的做法

- <strong>先别看前面的课。</strong>每个 TODO 后面括号里写了它对应哪一课。实在想不起来再回去看，回去看过的部件，过一天再闭卷写一遍。
- <strong>从上往下写，每写完一段就点「检查」。</strong>代码会在第一个没完成的 TODO 处停下，下面的检查项会告诉你哪些部件已经对了。
- <strong>注意创建顺序。</strong>模块里各子层的创建顺序决定了随机初始化的结果，顺序不同，「初始化与原版相同」这一项就过不了。
- 类名 `FeedFoward` 和属性名（`sa`、`ffwd`、`ln_f`、`lm_head`……）都要和原版完全一样，原因第 28 课讲过：存档按名字对应参数。

<div class="predict">

<strong>先猜一猜</strong>：整份代码去掉注释和空行有多少行？你觉得自己能不看提示写出几成？

<details><summary>想好了再点开</summary>

原版去掉注释和空行约 <strong>160 行</strong>，其中模型部分（5 个类）约 100 行。只要你能讲清楚每个类为什么存在，剩下的就是把它们照着顺序写出来。

</details>
</div>

## 你的任务

把骨架里所有 `TODO(...)` 换成实现，让全部检查项通过。

<details><summary>提示：卡住时先想这几个问题</summary>

- `get_batch` 返回的 `y` 和 `x` 是什么关系？（第 5 课）
- 打分为什么要乘 `head_size ** -0.5`？遮罩要遮住哪一半？（第 15–16 课）
- Block 里的 LayerNorm 放在子层之前还是之后？残差加在哪里？（第 20 课）
- 交叉熵要求 logits 是什么形状？（第 8、24 课）
- `generate` 为什么要截取最后 `block_size` 个？（第 25 课）

</details>

## 通过之后

<strong>整门课完成。</strong>你已经从空文件写出了 Karpathy 的 gpt.py，每一块都和原版逐元素对上了。

接下来可以试试：

- 把超参数改回原版（`n_embd=384`、6 层、`block_size=256`），在有 GPU 的机器上训练 5000 步，看 val loss 能不能降到 1.48。
- 换一份语料（比如中文小说），观察 `vocab_size` 的变化。
- 看 Karpathy 的 [nanoGPT](https://github.com/karpathy/nanoGPT)：它和这份代码结构相同，但加了 Flash Attention、权重共享、学习率调度等改进。
