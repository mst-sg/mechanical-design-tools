"""Exercise the built US entry in Workerd, with a loopback-only HTTP upstream."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent.parent
WORKERD = Path(os.environ.get("WORKERD_BIN", ROOT / "node_modules/.bin/workerd"))
MODULE = ROOT / "us-entry-dist/worker.mjs"
calls = []
fixture_status = 200


class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        calls.append({"method": self.command, "path": self.path, "headers": dict(self.headers)})
        content_type = "text/html"
        body = b"<!doctype html><h1>Owned runtime fixture</h1>"
        if self.path.endswith(".zip"):
            content_type, body = "application/zip", b"PK\x03\x04owned-runtime-fixture"
        elif self.path.endswith("SHA256SUMS"):
            content_type, body = "application/octet-stream", b"owned-sha256  handbook.html\n"
        self.send_response(fixture_status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Set-Cookie", "upstream-only=1")
        if fixture_status == 302:
            self.send_header("Location", "/redirect-must-not-be-fetched")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    do_HEAD = do_GET


def request(port, path, method="GET"):
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}", method=method,
        headers={"Cookie": "PRIVATE_SENTINEL=1", "Authorization": "Bearer PRIVATE_SENTINEL"},
    )
    try:
        return urllib.request.urlopen(req, timeout=5)
    except urllib.error.HTTPError as response:
        return response


with tempfile.TemporaryDirectory(prefix="mst-us-workerd-") as directory:
    directory = Path(directory)
    (directory / "worker.mjs").write_bytes(MODULE.read_bytes())
    # Only adapt the local listener's URL to the production origin under test.
    (directory / "wrapper.mjs").write_text('''
import entry from './worker.mjs';
export default { fetch(request) {
  const url = new URL(request.url);
  return entry.fetch(new Request('https://mst-us.ai' + url.pathname + url.search, request));
}};
''')
    fixture = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
    thread = threading.Thread(target=fixture.serve_forever, daemon=True)
    thread.start()
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    (directory / "config.capnp").write_text('''
using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [
    (name="main",worker=(
      modules=[(name="wrapper.mjs",esModule=embed "wrapper.mjs"),
               (name="worker.mjs",esModule=embed "worker.mjs")],
      compatibilityDate="2026-10-01",globalOutbound="fixture")),
    (name="fixture",external=(address="127.0.0.1:%d",http=()))
  ],
  sockets=[(name="http",address="127.0.0.1:%d",http=(),service="main")]
);
''' % (fixture.server_port, port))
    with (directory / "runtime.log").open("w+") as log:
        process = subprocess.Popen([str(WORKERD), "serve", "config.capnp"], cwd=directory, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 10
            while True:
                try:
                    with request(port, "/tools/bom-check/") as response:
                        assert response.status == 200
                    break
                except OSError:
                    assert process.poll() is None, "Workerd exited before readiness"
                    if time.monotonic() >= deadline:
                        raise TimeoutError("Workerd did not become ready")
                    time.sleep(0.05)
            assert not calls, "The entry shell must not fetch an upstream"
            for path in [
                "/tools/handbook", "/tools/handbook/", "/tools/handbook/index.html",
                "/tools/labs/drawing-bom/handbook.html",
                "/tools/labs/drawing-bom/drawing-bom-lab.zip",
                "/tools/labs/drawing-bom/SHA256SUMS",
            ]:
                for method in ["GET", "HEAD"]:
                    before = len(calls)
                    with request(port, path + "?token=PRIVATE_SENTINEL", method) as response:
                        assert response.status == 200, (method, path, response.status)
                        assert response.headers["Cache-Control"] == "no-store"
                        assert response.headers.get("Set-Cookie") is None
                        assert bool(response.read()) == (method == "GET")
                    assert len(calls) == before + 1
                    call = calls[-1]
                    assert call["method"] == method
                    assert call["path"] == ("/tools/handbook/" if path == "/tools/handbook" else path)
                    assert "PRIVATE_SENTINEL" not in json.dumps(call)
                    assert call["headers"]["Host"] == "tools.mst-us.ai"
            fixture_status = 302
            before = len(calls)
            with request(port, "/tools/handbook/") as response:
                assert response.status == 503
                assert response.headers.get("Location") is None
                assert response.headers["Cache-Control"] == "no-store"
            assert len(calls) == before + 1, "A redirect must never be followed"
            with request(port, "/tools/handbook/private") as response:
                assert response.status == 404
            assert len(calls) == before + 1
            print("PASS: Workerd public docs GET/HEAD (12), no credentials/query forwarding, redirect rejection, unknown path")
        except BaseException:
            log.flush()
            log.seek(0)
            print(log.read())
            raise
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            fixture.shutdown()
            fixture.server_close()
