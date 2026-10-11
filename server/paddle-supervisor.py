"""Process-external deadline: native code holding the GIL cannot delay it."""
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


def supervise(command):
    marker = Path('/tmp') / ('mst-paddle-deadline-' + str(os.getpid()))
    marker.touch(mode=0o600, exist_ok=False)
    marker.write_text(str(time.monotonic() + 300))
    env = dict(os.environ, MST_PADDLE_DEADLINE_FILE=str(marker))
    child = subprocess.Popen(command, env=env, start_new_session=True)
    try:
        while child.poll() is None:
            try:
                raw = marker.read_text()
                # Empty during the tiny truncate/write window: retry next tick.
                deadline = float(raw) if raw else time.monotonic() + 1
                if not math.isfinite(deadline) or time.monotonic() > deadline:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait()
                    return 70
            except FileNotFoundError:
                pass  # Model ready and no inference in progress.
            time.sleep(0.1)
        return child.returncode
    finally:
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
        marker.unlink(missing_ok=True)


if __name__ == '__main__':
    sys.exit(supervise([sys.executable, str(Path(__file__).with_name('paddle-service.py'))]))
