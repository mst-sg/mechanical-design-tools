import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
test("external watchdog kills native inference even while its Python GIL is held", async () => {
  const root = mkdtempSync(join(tmpdir(), "paddle-watchdog-"));
  try {
    copyFileSync(
      "server/paddle-supervisor.py",
      join(root, "paddle-supervisor.py"),
    );
    writeFileSync(
      join(root, "paddle-service.py"),
      `import ctypes, os, time\nfrom pathlib import Path\nPath(os.environ['MST_PADDLE_DEADLINE_FILE']).write_text(str(time.monotonic()+0.15))\nctypes.PyDLL(None).sleep(10)\n`,
    );
    const started = Date.now();
    await assert.rejects(
      promisify(execFile)("python3", [join(root, "paddle-supervisor.py")], {
        timeout: 4000,
      }),
      (e: unknown) => (e as { code: number }).code === 70,
    );
    assert.ok(Date.now() - started < 3000);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
