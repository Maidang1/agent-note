#!/usr/bin/env python3
"""统管启动器：分别以后端子进程组启动本机执行后端与 Astro 课程站。

设计：
- 用 start_new_session=True 让 backend / npm 各自成为独立会话/进程组的首领；
  launcher 只记录自己亲手创建的 Popen（及其 pgid），不按端口、不按命令名广杀。
- 收到 SIGINT / SIGTERM 时，只对自己创建的进程组发 SIGTERM（随后兜底 SIGKILL），
  并等待退出。绝不触碰未知端口或其它项目的进程。
"""
from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend" / "runner_server.py"
ASTRO_DIR = ROOT / "astro"

children: list[subprocess.Popen] = []
own_groups: list[int] = []  # spawn 时记录的进程组 id（== 首领 pid），停止时直接用，不再查新 pgid


def resolve_python() -> str:
    """与 run.sh 同一优先级：TUTORIAL_PYTHON -> .venv -> 旁侧 .tutorial-venv -> sys.executable.
    只转绝对路径、不 resolve 符号链接，保持 .venv/bin/python 的 venv 身份（否则会指向底层 python
    而丢失 venv 的 site-packages）。"""
    env = os.environ.get("TUTORIAL_PYTHON")
    if env and Path(env).exists():
        return str(Path(env).absolute())
    for rel in (".venv/bin/python", "../.tutorial-venv/bin/python"):
        p = (ROOT / rel).absolute()
        if p.exists():
            return str(p)
    return sys.executable


def spawn(cmd: list[str], cwd: Path) -> subprocess.Popen:
    p = subprocess.Popen(cmd, cwd=str(cwd), start_new_session=True)
    children.append(p)
    own_groups.append(p.pid)  # start_new_session 使首领 pid == 该组 pgid
    print(f"[launcher] 启动 pid={p.pid} pgid={p.pid} :: {' '.join(cmd)}", flush=True)
    return p


def stop_children() -> None:
    # 第一轮：对自己启动时记录的进程组发 SIGTERM（首领已退也照发，清理组内其它成员如 node）
    for pgid in own_groups:
        try:
            os.killpg(pgid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    # 等待最多 5 秒
    deadline = time.time() + 5.0
    for p in children:
        remain = max(0.0, deadline - time.time())
        try:
            p.wait(timeout=remain)
        except subprocess.TimeoutExpired:
            pass
    # 兜底：对记录的组再发 SIGKILL（组内可能仍有未退成员）
    for pgid in own_groups:
        try:
            os.killpg(pgid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    for p in children:
        try:
            p.wait(timeout=3)
        except subprocess.TimeoutExpired:
            pass
    print("[launcher] 已停止全部由本启动器创建的进程组。", flush=True)


def _on_signal(signum, frame):
    stop_children()
    sys.exit(0)


def main() -> int:
    py = resolve_python()
    spawn([py, str(BACKEND)], cwd=ROOT)
    spawn(["npm", "run", "dev"], cwd=ASTRO_DIR)

    signal.signal(signal.SIGINT, _on_signal)
    signal.signal(signal.SIGTERM, _on_signal)

    print("[launcher] 运行中（SIGINT/SIGTERM 将仅停止本启动器创建的进程）。", flush=True)
    try:
        while True:
            time.sleep(0.5)
            # 任一子进程意外退出，则整体收尾
            if any(p.poll() is not None for p in children):
                break
    finally:
        stop_children()
    return 0


if __name__ == "__main__":
    sys.exit(main())
