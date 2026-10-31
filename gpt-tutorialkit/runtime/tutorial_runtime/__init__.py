"""tutorial_runtime：本机 PyTorch 课程运行辅助。

课程代码以
    from tutorial_runtime import load_original, TODO
开始。把包含本包的目录（即 runtime/ 这一层）加入 PYTHONPATH 即可导入：
    PYTHONPATH=<项目>/runtime python lesson.py
"""

from .loader import load_original, PINNED_COMMIT, CORPUS
from .todo import TODO, TodoNotDone

__all__ = ["load_original", "PINNED_COMMIT", "CORPUS", "TODO", "TodoNotDone"]
__version__ = "0.2.0"
