# Drawing-to-BOM server processing

Choosing **Extract BOM** uploads the original PNG/JPEG/PDF to MST's private GPU server. Node renders the selected page/crop, then a private PaddleOCR adapter reads printed text on a GPU. The adapter accepts PNG bytes only, never a caller-controlled path or URL. Positioned text and recognizable table headers become reviewable BOM rows. It does not infer unseen parts. Other tools keep their current browser processing.

Originals and recognized results are retained until the visitor or an administrator deletes them. A 256-bit bearer capability protects status, results, cancellation and deletion; it never appears in a URL. Browser local storage retains previous jobs across tab closures. Visitors can save a private JSON receipt and import it to retrieve or delete that job after clearing browser storage. Anyone with that receipt can access the job. No file backups or model-training use are configured.

Deletion removes the original, result, access record and associated private upload context. Reviewed rows already shown in a tab remain until the tab closes or another input is selected. Anonymous daily aggregates survive deletion for 180 days. An optional positive `MST_JOBS_RETENTION_DAYS` enables expiry; both the running service and standalone cleanup honor the same stored deadline. Zero means no automatic expiry.

## Private usage records

SQLite joins each job with its original filename, SHA-256, anonymous browser visitor ID, keyed network identifier, optional self-reported email, referrer hostname, bounded user agent, selected page/crop, processing states, engine version/device, row count and retrieval/display/export events. Filename is display metadata, never a storage path. These records are private and only readable through authorized server access. Anonymous IDs and unverified email do not establish a person's real identity and never grant access to files.

Run `MST_JOBS_DATA=/private/data node server-dist/report.mjs YYYY-MM-DD` for UTC+8 daily counts; add `--jobs` for private upload details. Never publish that output. Use `traffic:test` for synthetic QA; it is reported separately and does not bypass limits. Optional page analytics and its GPC/DNT choices remain separate from records needed to deliver the requested upload service.

## Verification

Use Node 24: `npm ci`, `npm run build`, `npm run build:gateway`, `npm test`, `npm run test:e2e`. CI uses a clearly labelled test-only Paddle HTTP response fixture to verify rendering, transport, table mapping, persistence, negative access checks and browser flows. It does **not** prove GPU inference or general OCR accuracy. The test host cannot serve production.

A release separately requires real Paddle GPU recognition of owned PNG/PDF fixtures with exact expected part/quantity rows, original-byte readback on the designated GPU server, private metadata/result joins, restart and receipt recovery, wrong-token refusal, cancellation/deletion, useful failures and public desktop/mobile verification. Passing synthetic examples is not an accuracy benchmark for arbitrary engineering drawings.

## Production

Publish exact passing main CI artifacts: `mechanical-gateway-<SHA>` on the trusted HTTPS gateway and `mechanical-jobs-<SHA>` on the GPU host. Verify all manifest hashes. The gateway build rewrites the static `/tools/` mount to `/engineering-tools/` and its API to `/engineering-tools-api/`; all processing code/assets and requests load from the trusted origin. Any former host may redirect visitors only; it must not serve the new upload page or receive service credentials.

Run immutable code and dependencies in bounded unprivileged containers. Pin a private Node 24 runtime and an isolated Paddle GPU environment; do not change neighboring model runtimes. The Paddle container has one GPU, preloaded local weights, no public port and no external network. The job container shares its private internal network and also joins a dedicated ingress bridge, publishing its API only on the private host address. Its entrypoint sets rules in its own network namespace: only the trusted gateway may connect, and only the private Paddle endpoint is allowed for new outbound connections. Initial NET_ADMIN/SETUID/SETGID/SETPCAP capabilities are dropped completely before the Node process starts. No host firewall rules are changed. Read-only code/root filesystems, dropped capabilities, private data mounts and memory/CPU/PID limits are required. The Paddle process exits on a 75-second inference watchdog and restarts under the container supervisor; Node's worker deadline is 90 seconds.

Required job configuration (secret values are supplied outside the repository):

```text
NODE_ENV=production
MST_JOBS_ORIGIN=https://your-trusted-origin
MST_JOBS_DATA=/private/data
MST_JOBS_ASSETS=/app/server-assets
MST_JOBS_BIND=0.0.0.0
MST_JOBS_PORT=4174
MST_JOBS_RETENTION_DAYS=0
MST_JOBS_TRUST_PROXY=1
MST_JOBS_GATEWAY_ADDRESS=<trusted-gateway-private-address>
MST_JOBS_GATEWAY_TOKEN=<private-random-secret>
MST_JOBS_PADDLE_URL=http://<private-paddle-container-address>:7018
MST_JOBS_PADDLE_IP=<private-paddle-container-address>
MST_JOBS_PADDLE_TOKEN=<different-private-random-secret>
```

Paddle requires `MST_PADDLE_TOKEN`, `MST_PADDLE_BIND=0.0.0.0` and project-local model-cache paths. GPU capability and the selected GPU device are checked; CPU fallback is refused. The runtime image template installs only system libraries. Install pinned Paddle packages in an isolated Python 3.12 environment and record the complete resolved dependency list, image digest and model checksums in the private release receipt.

The Node API verifies both the gateway's socket peer and a separate gateway credential before trusting `X-Real-IP`. The gateway overwrites incoming gateway/IP headers and preserves the independent job `Authorization` header. Trust CDN IP headers only from verified proxy ranges. Same-origin mutation checks remain enabled; no cross-origin access, public listing or original-file URL is provided.

Disable Nginx request and response buffering and caching. Put fallback request-body temporary files on a bounded RAM-backed `/run` directory; verify that large streaming uploads do not spill onto persistent gateway storage. Use the scoped Nginx template and preserve unrelated routes. Legacy systemd templates are alternatives for a suitably isolated single host, not the two-host deployment recipe.

Limits: 25 MiB/file, 60 megapixel input, 8 megapixel recognition image, one worker, 12 pending jobs, two pending/network address, 20 admissions over current/previous hourly buckets, 20 GiB total originals and a 2 GiB free-disk reserve. Full storage returns a useful error instead of evicting retained files. Uploads have a 45-second deadline and queued work a two-minute bound. Keep the previous immutable release and gateway configuration for rollback; retained data must survive a code rollback.

References: [PaddleOCR](https://www.paddleocr.ai/latest/en/quick_start.html), [Node SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html), [PDF.js](https://mozilla.github.io/pdf.js/examples/), [Nginx request buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_request_buffering).
