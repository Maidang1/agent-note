# 手写 GPT · 本机 PyTorch 实验课

把 karpathy/ng-video-lecture（固定提交 `52201428ed7b46804849dea0b3ccf0de9df1a5c3`）的
`gpt.py` 拆成 29 课，每课空出原版的一小块让你补写，点「检查」后由判题器用同一随机种子和原版逐元素比对；
最后一课从空骨架闭卷写出完整的 gpt.py。**代码在本机用真实 PyTorch 跑（CPU），不是浏览器沙箱。**

面向会 Python、但不熟悉深度学习的读者。路线：

| 模块 | 课 | 里程碑 |
|---|---|---|
| 1 把文字变成训练数据 | 1–5 | 能随机切出一批 (x, y) |
| 2 Bigram：最简单的语言模型 | 6–9 | 未训练的模型能生成（乱码） |
| 3 训练循环 | 10–12 | Bigram 训到 val loss ≈ 2.49 |
| 4 自注意力与 Transformer Block | 13–20 | 亲手写出 Head → 多头 → 前馈 → Block |
| 5 组装 GPT | 21–25 | GPTLanguageModel 整个类 |
| 6 训练你的 GPT | 26–28 | CPU 上训到 val ≈ 2.17，超过 Bigram；采样、存档 |
| 7 结业 | 29 | 闭卷复现 gpt.py |

另有 `/guide`（全貌导读）和 `/map`（源码地图：原版每一行对应哪一课，做完的课会点亮）。

## 环境要求

- macOS / Linux，Python 3.11+，已装好 `torch`、`numpy`
- Node 18+，npm
- 解释器解析优先级（launcher / backend / 自检脚本一致）：
  `TUTORIAL_PYTHON` → 项目内 `.venv/bin/python` → 旁侧 `../.tutorial-venv/bin/python` → `sys.executable`。

## 第一次运行（新机器/解压后）

```bash
# 1) 前端依赖（仅首次）：锁定版本安装
cd astro && npm ci && cd ..

# 2) 本机 PyTorch 环境（任选其一，项目 .venv 优先级最高）：
#    - 新建独立项目 venv（推荐）：
#        python3 -m venv .venv
#        .venv/bin/pip install -r requirements.txt   # 安装 torch / numpy（CPU）
#    - 指定已有解释器：export TUTORIAL_PYTHON=/path/to/python
#    （旁侧 ../.tutorial-venv 仅作历史只读回退，不改动它）

# 3) 一键启动
./run.sh
```

然后浏览器打开 http://127.0.0.1:4321 （会自动跳到零基础导读 `/guide`，读完再进入第 1 课）。

- 执行后端：http://127.0.0.1:8765 （仅 loopback）
- 课程站：http://127.0.0.1:4321 （仅 loopback）

> 端口固定（8765/4321）。若服务已在运行，重复 `./run.sh` 会因端口占用直接退出，
> 不会自动换端口（避免 CORS 来源错位）。
>
> **停止**：`run.sh` 仅 `exec launcher.py`。launcher 用 `start_new_session=True` 分别启动
> backend 与课程站，并只记录自己这两个子进程组；收到终止信号时，它只对这两个自建进程组发
> SIGTERM（等待后兜底 SIGKILL），不按端口、不按命令名全局杀进程，因此不会误动其它项目。
> 「只清理自建进程组、且首领先退出后仍能清理组内成员」的逻辑已用程序直接调用验证；
> 终端里 Ctrl-C（SIGINT）触发整条停止路径尚未实测。若停止后 `lsof -iTCP:8765 -iTCP:4321`
> 仍有残留，可手动结束对应 PID。

> 说明：右侧「运行」会把编辑器里的代码 POST 到本机后端，后端在独立临时目录、独立子进程里
> 用真实 PyTorch 执行。编辑的代码以**当前用户权限**运行，不是安全沙箱；边界是「只监听
> 127.0.0.1 + 并发上限 1 + 单次 40s 超时 + 输出截断 200KB + 每次独立进程重置」，
> 不提供任意文件下载 / 路径接口 / 凭证。

## 目录

```
course/NN-<slug>/          # 课程源文件（唯一需要手写的地方），每课三个文件：
  lesson.md                #   课文 + frontmatter
  code.py                  #   完整答案代码，行尾标记哪些行留给学习者写
  check.py                 #   判题项
scripts/
  build_course.py          # course/ → astro/src/content/tutorial + astro/src/nav-order.json（增量同步）
  check_course.py          # 课程自检：答案必须全过、初始代码必须有不过的
  coursecode.py            # 从 code.py 推导初始代码 / 参考答案
runtime/tutorial_runtime/
  loader.py                # load_original：AST 截取原版定义、施加轻量覆盖、固定种子
  checking.py              # 判题小工具：check / expect / same / same_init / same_forward / copy_weights
  grader.py                # 判题入口：执行学习者代码，再逐项跑 check.py
  todo.py                  # TODO()：初始代码里的占位，调用即报「还没完成」
  input.txt, _originals/   # 随附语料与原版 bigram.py / gpt.py
backend/runner_server.py   # loopback 执行后端：POST /run 运行，POST /check 判题
astro/                     # 课程站（TutorialKit + 自建页面）
  src/pages/               #   [...slug]（课程页）、guide、map
  src/components/          #   PythonRunner（编辑器 + 运行 / 检查）、CourseSidebar
  src/lib/                 #   course.ts（课程元数据）、progress.ts（localStorage 进度与草稿）
legacy/                    # 改版前的 32 课与脚本，已停用
```

## 一课是怎么写成的

**`lesson.md`**：frontmatter + 正文。

```markdown
---
title: get_batch：随机剪一批「题目 + 答案」
module: m1-data            # 模块 id，见 scripts/build_course.py 的 MODULES
goal: 一句话目标，显示在标题下
refs: gpt.py:40-48         # 对应的原版行，逗号分隔；可为空。用于「对照原版」和源码地图
---
```

正文惯例：`## 为什么…` → `<div class="predict">` 先猜一猜（答案放 `<details>`）→ `## 你的任务` → 提示 `<details>` → `## 通过之后`。

**`code.py`**：只写一份完整、能跑通的答案，在行尾加标记，构建时推导出初始代码：

```python
ix = torch.randint(len(data) - block_size, (batch_size,))  # @TODO torch.randint(上限, (batch_size,))
#   → ix = TODO('torch.randint(上限, (batch_size,))')       保留赋值左边
for iter in range(max_iters):  # @TODO! 写出整个循环
#   → TODO('写出整个循环')                                   整行替换
    xb, yb = get_batch('train')  # @DROP                     初始代码里删掉
```

**`check.py`**：用 `@check('说明')` 声明检查项，按顺序执行；`L` 是学习者代码跑完后的全局命名空间。
失败消息会原样显示给学习者，写成「哪里不对 + 往哪改」。

```python
from tutorial_runtime.checking import check, ref, same_init, same_forward

@check('Head 的初始化和原版相同')
def _(L):
    R = ref('gpt')                                   # 一份全新的原版命名空间
    mine, theirs = same_init(lambda: L['Head'](8), lambda: R['Head'](8), 'Head')
    same_forward(mine, theirs, (R['torch'].randn(2, 6, 32),), 'Head', train=True)
```

## 构建与自检

```bash
.venv/bin/python scripts/build_course.py     # 改了 course/ 之后运行；dev server 开着也可以
.venv/bin/python scripts/check_course.py     # 全部 29 课，约 1 分钟；结果写入 tests/reports/course-check.json
.venv/bin/python scripts/check_course.py 05 27   # 只跑编号以这些开头的课
cd astro && npm run build                    # astro check + 静态构建
```

自检对每课做两件事：参考答案必须**全部**通过；初始代码必须能跑完判题，且**至少一项**不通过（保证检查项真的覆盖了 TODO）。
每次判题都在独立临时目录、独立进程里运行，40 秒上限（和后端一致），所以训练类的课要把配置调到能在时限内跑完答案和检查。

## 课程如何复用原版而不跑长训练

`load_original('bigram'|'gpt', overrides={})` 用 AST 把原版代码截到 `model = ...` 之前执行，
返回的命名空间就是原版函数的 globals，所以超参覆盖对 `get_batch` / `estimate_loss` 实时生效。
统一施加的轻量覆盖：`batch_size=4, block_size=8, max_iters=12, eval_interval=6, eval_iters=3,
n_embd=32, n_head=4, n_layer=2, dropout=0.1`，固定 `seed=1337`；单课可以在此基础上再覆盖。
每课只空出一块，其余部件都从这里取，学习者专注于当前这一块；结业课则完全不用它。
