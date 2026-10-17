#!/usr/bin/env python3
"""Exercise the real US Nginx template on isolated loopback fixtures."""
import http.server
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request


def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


class PrivateFixture(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"private":true}')

    def log_message(self, *args):
        pass


def read(base, path, headers=None):
    try:
        response = urllib.request.urlopen(urllib.request.Request(base + path, headers=headers or {}), timeout=3)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()


binary = os.environ.get('NGINX_BIN') or shutil.which('nginx')
assert binary, 'Install nginx to verify the actual release configuration'
source = Path('deploy/nginx-us-tools.conf').read_text()
upstream = http.server.HTTPServer(('127.0.0.1', 0), PrivateFixture)
threading.Thread(target=upstream.serve_forever, daemon=True).start()
checks = []
try:
    with tempfile.TemporaryDirectory(prefix='mst-us-cache-') as temporary:
        root = Path(temporary)
        public = root / 'public'
        for path in ['assets/index-abcdefgh.js', 'assets/index-abCD12_-.css', 'assets/plain.js', 'index.html', 'handbook/index.html', 'vendor/worker.js']:
            file = public / path
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text('synthetic public fixture\n')
        listen = port()
        config = source.replace('listen 443 ssl;', f'listen 127.0.0.1:{listen};')
        config = config.replace('server_name tools.mst-us.ai;', 'server_name localhost;')
        config = re.sub(r'^\s*(?:ssl_certificate|ssl_certificate_key|ssl_protocols|include)\s+.*;\s*$', '', config, flags=re.M)
        config = config.replace('/var/log/nginx/mst-us-tools-error.log', str(root / 'error.log'))
        config = config.replace('/opt/mst-us-tools-gateway/current/', str(public) + '/')
        config = config.replace('/run/mst-us-tools-body', str(root / 'body'))
        config = config.replace('US_GPU_PRIVATE_ADDRESS:4175', f'127.0.0.1:{upstream.server_port}')
        (root / 'nginx.conf').write_text(f'pid {root}/nginx.pid;\nerror_log {root}/error.log;\nevents {{}}\nhttp {{\n{config}\n}}\n')
        command = [binary, '-p', str(root) + '/', '-c', 'nginx.conf']
        subprocess.run(command + ['-t'], check=True, capture_output=True)
        process = subprocess.Popen(command + ['-g', 'daemon off;'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            base = f'http://127.0.0.1:{listen}'
            for attempt in range(50):
                try:
                    read(base, '/tools/')
                    break
                except OSError:
                    time.sleep(.02)
            cases = [
                ('/tools/assets/index-abcdefgh.js', 200, True),
                ('/tools/assets/index-abCD12_-.css?release=1', 200, True),
                ('/tools/assets/plain.js', 200, False),
                ('/tools/', 200, False),
                ('/tools/handbook/', 200, False),
                ('/tools/vendor/worker.js', 200, False),
                ('/tools-api/health', 200, False),
                ('/tools-api/v1/submissions/owned/record', 200, False),
                ('/tools-api/v1/submissions/owned/files/index-abcdefgh.js', 200, False),
                ('/tools/assets/missing-abcdefgh.js', 404, False),
            ]
            for path, expected_status, cached in cases:
                status, headers, body = read(base, path, {'Authorization': 'Bearer synthetic-fixture'})
                assert status == expected_status, (path, status)
                expected_cache = 'public, max-age=31536000, immutable' if cached else 'no-store'
                assert headers.get_all('Cache-Control') == [expected_cache], (path, headers.get_all('Cache-Control'))
                assert "frame-ancestors https://mst-us.ai" in headers['Content-Security-Policy'], path
                assert headers['X-Content-Type-Options'] == 'nosniff', path
                checks.append((path, status, expected_cache))
            status, headers, body = read(base, '/tools/assets/index-abcdefgh.js', {'Range': 'bytes=0-4'})
            assert status == 206 and body == b'synth'
            assert headers['Cache-Control'] == 'public, max-age=31536000, immutable'
            status, headers, _ = read(base, '/tools/assets/index-abcdefgh.js', {'If-Modified-Since': headers['Last-Modified']})
            assert status == 304 and headers['Cache-Control'] == 'public, max-age=31536000, immutable'
            print(f'PASS: {len(checks)} cache/header cases plus range206 and revalidation304; isolated real nginx')
        finally:
            process.terminate()
            process.communicate(timeout=5)
finally:
    upstream.shutdown()
    upstream.server_close()
