#!/usr/bin/env bash
# 一键启动：本机 PyTorch 执行后端（127.0.0.1:8765）+ Astro 课程站（127.0.0.1:4321）。
# 全部仅 loopback，端口固定（被占用即报错退出，不自动切换，避免 CORS 来源错位）。
# 实际进程管理（独立进程组 / 仅停止自己创建的子进程组）由 launcher.py 统管。
set -u
cd "$(dirname "$0")"

# ---- 解释器选择（优先级）----
# 1) 环境变量 TUTORIAL_PYTHON  2) 项目内 .venv/bin/python  3) 旁侧只读 .tutorial-venv/bin/python
pick_python() {
  if [ -n "${TUTORIAL_PYTHON:-}" ] && [ -x "$TUTORIAL_PYTHON" ]; then echo "$TUTORIAL_PYTHON"; return; fi
  if [ -x ".venv/bin/python" ]; then echo ".venv/bin/python"; return; fi
  if [ -x "../.tutorial-venv/bin/python" ]; then echo "../.tutorial-venv/bin/python"; return; fi
  echo ""
}
PY="$(pick_python)"
if [ -z "$PY" ]; then
  echo "[run] 未找到可用 Python（需已装 torch/numpy）。"
  echo "      请:  1) python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  echo "          或  2) TUTORIAL_PYTHON=/path/to/python ./run.sh"
  exit 1
fi
"$PY" -c "import torch,numpy" 2>/dev/null || { echo "[run] $PY 缺少 torch/numpy，请先按 requirements.txt 安装"; exit 1; }

# ---- 端口占用即失败（不自动切换）----
port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
for P in 8765 4321; do
  if port_busy "$P"; then echo "[run] 端口 $P 已被占用（请先停掉旧进程）。为保证 CORS 来源固定，不自动换端口。"; exit 1; fi
done

# 由 launcher.py 统管子进程组；run.sh 仅 exec 它。
exec "$PY" launcher.py
