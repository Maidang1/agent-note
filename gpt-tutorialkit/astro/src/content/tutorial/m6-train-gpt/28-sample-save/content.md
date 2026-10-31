---
type: lesson
title: "用训好的模型写作，并把它存下来"
---

## 为什么要比原版多做两件事

原版最后两行从一个换行符开始生成 500 个字符就结束了。实际使用时还要能做两件事：

<strong>1. 从任意开头续写。</strong> 把 prompt 用 `encode` 变成编号，包成 `(1, T)` 的张量（batch 维是 1），交给 `generate`。

<strong>2. 生成时用 eval 模式。</strong> 原版生成时模型还在 train 模式，dropout 仍在随机丢东西，相当于故意让模型「手抖」。生成时应该 `model.eval()`，并用 `torch.no_grad()` 省掉不需要的计算图。这是<strong>本课相对原版的改动</strong>，生成的文字会稍微好一点。

<strong>3. 存档。</strong> 每次运行都是新进程，训好的模型不存下来就没了。`model.state_dict()` 是一个「参数名 → 张量」的字典，只包含数字、不包含代码。读回时先用同一个类建一个空模型，再 `load_state_dict`。所以存档能不能用，取决于类的结构和参数名是否一致，这也是判题器一直要求属性名和原版完全一样的原因。

<div class="predict">

<strong>先猜一猜</strong>：用同一个随机种子，原模型和读回的模型生成同一个 prompt，结果会一样吗？

<details><summary>想好了再点开</summary>

<strong>完全一样</strong>。参数相同、随机数序列相同、eval 模式下没有 dropout 的额外随机性，整个计算就是确定的。

</details>
</div>

## 你的任务

1. 补全 `sample`：eval 模式、编码 prompt、生成、解码。
2. 补全存档和读档两行。

<details><summary>提示 1：编码 prompt</summary>

`torch.tensor([encode(prompt)], dtype=torch.long, device=device)`：外面多套一层列表，形状就是 `(1, T)`。

</details>

<details><summary>提示 2：存档</summary>

`torch.save(model.state_dict(), 'gpt.pt')`、`model2.load_state_dict(torch.load('gpt.pt'))`。文件写在本次运行的临时目录里，运行结束就会清理。

</details>

## 通过之后

<strong>模块 6 完成：从读文本到训练、生成、存档，gpt.py 的每一部分你都亲手写过了。</strong>最后一课：不看前面的课，从一个空骨架把它整个写出来。
