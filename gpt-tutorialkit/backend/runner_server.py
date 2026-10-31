"""本机 PyTorch 执行后端（仅 loopback）—— 加固版。

设计约束（来自任务硬约束）：
- 只绑定 127.0.0.1，不对外暴露；不提供任意文件下载/路径接口，不携带凭证。
- 每次运行都是全新子进程 + 全新临时目录（工程内 .runs/），权重与状态不跨运行共享。
- 并发=1；运行时长上限；输出真限流（流式读取，到上限即终止进程）；提供授权“停止”。
- 跨源保护：仅放行本机前端来源；Host/Origin 校验；POST 要求 application/json；
  请求体大小上限；/stop 改为需同源 Origin 的 POST（不再是无授权 GET 状态变更）。
- 超时/超输出用进程组 kill，避免子进程遗留；临时目录用 shutil 清理自建目录，不用裸 rm -rf。
- /check 与 /run 走同一条隔离路径，只是改由 tutorial_runtime.grader 执行并判题；
  课程 id 走白名单正则 + course/<id>/check.py 必须存在，不接受任意路径。
- 代码在“当前用户权限”下运行，不是真沙箱；因此用 loopback + 资源上限作为边界。

仅用 Python 标准库。
"""

from __future__ import annotations

import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# ---- 路径配置（相对本文件定位，不依赖 cwd）----
_BACKEND_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _BACKEND_DIR.parent
_RUNTIME_DIR = _PROJECT_ROOT / "runtime"  # 包含 tutorial_runtime 包
_RUNS_DIR = _PROJECT_ROOT / ".runs"        # 工程内 scratch，集中清理
_COURSE_DIR = _PROJECT_ROOT / "course"     # 每课 check.py 所在处（判题用）
_LESSON_ID = re.compile(r"^[0-9]{2}-[a-z0-9-]{1,60}$")

# 解释器选择（与 run.sh 同一优先级，resolve 绝对路径）：
#   1) 环境变量 TUTORIAL_PYTHON  2) 项目内 .venv/bin/python  3) 旁侧 .tutorial-venv/bin/python
#   4) 兜底 sys.executable
def _resolve_python() -> str:
    env = os.environ.get("TUTORIAL_PYTHON")
    if env and Path(env).exists():
        return str(Path(env).absolute())  # 不 resolve 符号链接，保持 venv 解释器身份
    for rel in (".venv/bin/python", "../.tutorial-venv/bin/python"):
        p = (_BACKEND_DIR / rel).absolute()
        if p.exists():
            return str(p)
    return sys.executable


PYTHON = _resolve_python()

# ---- 资源/安全上限 ----
MAX_CONCURRENT = 1          # 并发=1：单条全局运行槽，语义简单
RUN_TIMEOUT_SEC = 40        # 单次运行最长秒数
MAX_OUTPUT_BYTES = 200_000  # stdout/stderr 各自真限流（流式读取，到上限即 kill）
MAX_BODY_BYTES = 64 * 1024  # 请求体上限（代码长度）

_ALLOWED_HOSTS = {"127.0.0.1:8765", "localhost:8765"}
_ALLOWED_ORIGINS = {
    "http://127.0.0.1:4321",
    "http://localhost:4321",
}

_lock = threading.Lock()
_current_proc: subprocess.Popen | None = None
_sem = threading.BoundedSemaphore(MAX_CONCURRENT)


def _clean_env() -> dict[str, str]:
    """只传最小必要环境，避免继承敏感变量。"""
    return {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "PYTHONPATH": str(_RUNTIME_DIR),
        "PYTHONDONTWRITEBYTECODE": "1",
        "MPLBACKEND": "Agg",
    }


def _read_stream(stream, cap: int, sink: list, done: threading.Event):
    """流式读取一个流，最多 cap 字节；到上限立刻置 done（主流程据此 kill）。"""
    chunks: list[bytes] = []
    total = 0
    try:
        while True:
            b = stream.read(4096)
            if not b:
                break
            total += len(b)
            if total <= cap:
                chunks.append(b)
            if total > cap:
                sink.append(("truncated", True))
                done.set()  # 触发主流程终止进程
                break
    finally:
        try:
            stream.close()
        except Exception:
            pass
    sink.append(("data", b"".join(chunks)[:cap]))


def _check_path(lesson: str) -> Path | None:
    """课程 id 只接受白名单格式，且必须是 course/ 下真实存在的 check.py。"""
    if not _LESSON_ID.match(lesson):
        return None
    path = _COURSE_DIR / lesson / "check.py"
    return path if path.is_file() else None


def run_code(code: str, check_file: Path | None = None) -> dict:
    """check_file 为空：直接运行 lesson.py；否则交给判题器，结果多一个 checks 字段。"""
    if not _sem.acquire(blocking=False):
        return {"ok": False, "error": "服务器忙：已有课程在运行，请先停止或稍后再试。",
                "exit_code": -1, "timed_out": False, "truncated": False}

    _RUNS_DIR.mkdir(parents=True, exist_ok=True)
    tmpdir = Path(tempfile.mkdtemp(prefix="tkrun_", dir=str(_RUNS_DIR)))
    script = tmpdir / "lesson.py"
    script.write_text(code, encoding="utf-8")
    started = time.time()
    result: dict
    proc: subprocess.Popen | None = None
    try:
        if check_file is None:
            argv = [PYTHON, str(script)]
        else:
            argv = [PYTHON, "-m", "tutorial_runtime.grader", str(check_file), "lesson.py", "result.json"]
        proc = subprocess.Popen(
            argv,
            cwd=str(tmpdir),
            env=_clean_env(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,  # 独立进程组，便于整组 kill
        )
        with _lock:
            global _current_proc
            _current_proc = proc

        out_sink: list = []
        err_sink: list = []
        over = threading.Event()
        t_out = threading.Thread(target=_read_stream, args=(proc.stdout, MAX_OUTPUT_BYTES, out_sink, over), daemon=True)
        t_err = threading.Thread(target=_read_stream, args=(proc.stderr, MAX_OUTPUT_BYTES, err_sink, over), daemon=True)
        t_out.start(); t_err.start()

        timed_out = False
        try:
            deadline = started + RUN_TIMEOUT_SEC
            while proc.poll() is None and time.time() < deadline and not over.is_set():
                time.sleep(0.05)
            if proc.poll() is None:
                timed_out = True
                _kill_group(proc)
        finally:
            t_out.join(timeout=5)
            t_err.join(timeout=5)

        out = next((v for k, v in out_sink if k == "data"), b"")
        err = next((v for k, v in err_sink if k == "data"), b"")
        truncated = any(k == "truncated" for k, _ in out_sink + err_sink)
        elapsed_ms = int((time.time() - started) * 1000)
        result = {
            "ok": True,
            "exit_code": proc.returncode if proc.returncode is not None else -9,
            "timed_out": timed_out,
            "truncated": truncated,
            "elapsed_ms": elapsed_ms,
            "stdout": out.decode("utf-8", "replace"),
            "stderr": err.decode("utf-8", "replace"),
        }
        if check_file is not None:
            report = tmpdir / "result.json"
            try:
                result["checks"] = json.loads(report.read_text(encoding="utf-8"))
            except Exception:
                result["checks"] = None  # 判题器没跑完（超时/被停止/崩溃）
    except Exception as exc:  # pragma: no cover - 防御性
        result = {"ok": False, "error": f"本地运行失败：{exc}", "exit_code": -1,
                  "timed_out": False, "truncated": False, "stdout": "", "stderr": "",
                  "elapsed_ms": int((time.time() - started) * 1000)}
    finally:
        with _lock:
            _current_proc = None
        _sem.release()
        # 只清理本函数自建的临时目录
        shutil.rmtree(tmpdir, ignore_errors=True)
    return result


def _kill_group(proc: subprocess.Popen) -> None:
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def stop_current() -> dict:
    with _lock:
        proc = _current_proc
    if proc and proc.poll() is None:
        _kill_group(proc)
        return {"ok": True, "stopped": True}
    return {"ok": True, "stopped": False}


class Handler(BaseHTTPRequestHandler):
    server_version = "TkRunner/1.0"

    # ---- 跨源 / Host 校验 ----
    def _origin_allowed(self) -> bool:
        host = self.headers.get("Host", "")
        if host not in _ALLOWED_HOSTS:
            return False
        origin = self.headers.get("Origin")
        if origin is None:
            return False  # 浏览器跨源请求必带 Origin；缺失即拒
        return origin in _ALLOWED_ORIGINS

    def _cors(self):
        origin = self.headers.get("Origin", "")
        if origin in _ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send(self, code: int, obj: dict, extra_headers: dict | None = None):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):  # 安静
        pass

    def do_OPTIONS(self):
        if not self._origin_allowed():
            self._send(403, {"ok": False, "error": "origin/host 不被允许"})
            return
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        # /health 用于本机健康检查：不做 Origin 校验，但仍限 loopback（绑定层面已限）
        if self.path == "/health":
            self._send(200, {
                "ok": True,
                "python": Path(PYTHON).name,
                "runtime_dir": str(_RUNTIME_DIR),
                "timeout_sec": RUN_TIMEOUT_SEC,
                "max_concurrent": MAX_CONCURRENT,
                "max_output_bytes": MAX_OUTPUT_BYTES,
            })
            return
        # 其余 GET（含旧的 /stop）一律拒绝：状态变更只走授权 POST
        self._send(405, {"ok": False, "error": "method not allowed；停止请 POST /stop"})

    def do_POST(self):
        if not self._origin_allowed():
            self._send(403, {"ok": False, "error": "origin/host 不被允许"})
            return
        ctype = (self.headers.get("Content-Type") or "").lower()
        if "application/json" not in ctype:
            self._send(415, {"ok": False, "error": "Content-Type 必须是 application/json"})
            return

        if self.path == "/stop":
            self._send(200, stop_current())
            return
        if self.path not in ("/run", "/check"):
            self._send(404, {"ok": False, "error": "not found"})
            return

        length = self.headers.get("Content-Length")
        if not length or not length.isdigit():
            self._send(411, {"ok": False, "error": "缺少 Content-Length"})
            return
        n = int(length)
        if n <= 0 or n > MAX_BODY_BYTES:
            self._send(413, {"ok": False, "error": f"请求体过长（上限 {MAX_BODY_BYTES} 字节）"})
            return
        raw = self.rfile.read(n)
        try:
            payload = json.loads(raw or b"{}")
            code = payload.get("code", "")
        except Exception as exc:
            self._send(400, {"ok": False, "error": f"请求体无效：{exc}"})
            return
        if not isinstance(code, str) or not code.strip():
            self._send(400, {"ok": False, "error": "缺少 code"})
            return
        if self.path == "/check":
            check_file = _check_path(str(payload.get("lesson", "")))
            if check_file is None:
                self._send(400, {"ok": False, "error": "未知课程 id"})
                return
            self._send(200, run_code(code, check_file))
            return
        self._send(200, run_code(code))


def main():
    host = "127.0.0.1"
    port = int(os.environ.get("TUTORIAL_PORT", "8765"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"[runner] loopback on http://{host}:{port}  python={PYTHON}", flush=True)
    print(f"[runner] runtime={_RUNTIME_DIR}  runs={_RUNS_DIR}  concurrency=1", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
