# US Drawing-to-BOM deployment

The public entry is **https://mst-us.ai/tools/drawing-to-bom/**. Do not deploy
the Singapore artifact as the US release or redirect this entry to Singapore.

## Release topology

- `deploy/us-entry/worker.ts` owns the exact root-domain entry at the edge.
  The fixed shell embeds `https://tools.mst-us.ai/tools/drawing-to-bom/` and
  makes no origin fetch. Files, results and capabilities never enter the shell.
- `npm run build:us-gateway` produces `us-gateway-dist/` from `dist/`, preserving
  `/tools/` and `/tools-api/`. Its manifest identifies both the child origin and
  public entry. All active PDF/JavaScript assets are self-hosted on the child.
  The legacy WordPress collector is removed; the private jobs service records
  upload, completion, display, export, and deletion events.
- A dedicated trusted gateway vhost uses `nginx-us-tools.conf`, its own release
  directory, certificate, token include, RAM body buffer and real-IP include.
  Substitute `US_GPU_PRIVATE_ADDRESS` only with the approved private GPU IP.
- A separate US jobs container publishes **private host port 4175** to internal
  port 4174. It uses `MST_JOBS_ORIGIN=https://tools.mst-us.ai`, a separate gateway
  secret and separate private data directory. Its receipt origin is the child.
  Reusing an existing Paddle service must pass bounded concurrency testing;
  never restart the existing SG job/Paddle services to create the US instance.

## Required activation evidence

1. Verify the reviewed commit's CI manifests and private backups. Leave existing
   originals/databases intact. Record target hostname and prior config hashes.
2. Verify Cloudflare account/zone, existing routes/DNS, plan and remaining quota.
   No paid plan or new paid resource is implied. Create the child DNS/certificate
   on the trusted gateway. The legacy US host receives no new private token.
3. Deploy US jobs and child gateway; run `nginx -t` before a reload. Configure
   Cloudflare real-IP CIDRs from the official list, and verify spoofed forwarding
   headers cannot substitute the caller identity. API paths must bypass every
   cache, never log bodies/bearers/filenames, and never spill to disk.
4. Verify child upload, original hash, real GPU results, `.xlsx` contents,
   retention and test-only usage records before the public entry switch.
5. Deploy the edge entry route from the same commit. Read back its source and
   route. **Confirm fail closed**, including the platform request-limit mode.
   No more-specific exception or redirect rule may bypass the shell. There is
   no legacy-origin fallback. Disable Worker observability request logging.
6. Public desktop/mobile checks must keep the root US URL, run inside the child,
   and download/reopen Excel. Same-site root and SG requests must fail even with
   an owned valid test capability. Child storage/DOM must be inaccessible to the
   root parent. Test PDF, image, reload, receipt, edited export and deletion.
7. Concurrent owned US/SG jobs must return the right result or bounded busy
   feedback. Cancelling one must not terminate another job's inference.
8. Recheck existing US/SG business health, save secret-free release evidence,
   and update the project vault. A build or local fixture run is not production
   acceptance or a claim of better engineering accuracy than general models.

## Trust and rollback boundaries

Cross-origin isolation prevents root-page scripts from directly reading the
real child's file input, DOM, storage or results. It does **not** make the old
root origin trustworthy: a compromised root page/service worker could present a
false UI or overlay. The edge shell does not resolve that host-wide incident.
No sensitive `postMessage`, `document.domain`, shared auth cookies, permissive
CORS, Origin rewriting or old-origin script fallback is allowed.

The shell permits `blob:` only in `frame-src`: WebKit applies this check to the
child's local Excel/CSV/receipt downloads. This does not relax script execution,
API origins or DOM isolation. Verify all three downloads inside the public shell.

Keep the previous child release pointer and Nginx config for rollback. If the
private tool fails, publish a static unavailable message at the same edge route;
do not revert the route to the legacy origin or Singapore. Do not remove user
files during rollback. Existing saved receipts on another origin stay there;
do not silently copy capabilities between origins.

## Current format/quality boundary

This increment accepts PNG/JPEG/PDF and generates real `.xlsx` plus CSV. Native
SOLIDWORKS/AutoCAD ingestion is a separate unfulfilled user requirement until a
real parser and supported formats are verified. Accepting an extension is not
native support. A qualitative community pain-point list and synthetic fixtures
are not evidence of BOM accuracy or superiority to ChatGPT/Claude. A comparison
requires the same representative drawings, reference BOMs, field/quantity/error
metrics and recorded model/configuration versions.

The pinned ExcelJS 4.4.0 dependency includes UUID 8.3.2, which audit lists under
[GHSA-w5hq-g745-h8pq](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq).
The affected v3/v5/v6 custom-buffer APIs are not used here: ExcelJS's only calls
are no-argument v4(), and this exporter writes literal cells without reading
external workbooks or adding conditional formatting. Independent review treats
this advisory as inapplicable to this path, not fixed; audit is not clean. Reassess
if UUID usage or spreadsheet import paths change. Job tokens use Web Crypto.

Cloudflare references: [route matching](https://developers.cloudflare.com/workers/configuration/routing/routes/),
[fail-closed limits](https://developers.cloudflare.com/workers/platform/limits/#daily-requests),
[Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).

## Public handbook and static cache policy

The edge worker also serves an exact allowlist of public handbook documents
from the trusted child static release: `/tools/handbook` (mapped to the trailing
slash), `/tools/handbook/`, `/tools/handbook/index.html`, and the drawing-BOM lab's
`handbook.html`, `drawing-bom-lab.zip` and `SHA256SUMS`. Configure Cloudflare
routes for those public paths; the worker rejects all unlisted paths. It never
forwards visitor query parameters, cookies, authorization or request bodies,
and refuses upstream redirects or unexpected content types. Workerd requires
`redirect: "manual"`; the entry rejects every non-200 response without following
its Location. After `npm run build:us-entry`, run
`python3 scripts/check-us-entry-runtime.py` against the pinned Workerd runtime.
This loopback HTTP check covers six documents with GET/HEAD, stripped visitor
credentials/query, and a 302 that must produce only one upstream request.
These documents
stay `no-store`, including their offline download copies. Deploy the child
artifact before activating the document routes. Preserve the previous worker
and route inventory for rollback; never serve this correction from the legacy
host.

Only `/tools/assets/<name>-<eight-character-content-hash>.js` and `.css` with
HTTP200/206/304 receive `public, max-age=31536000, immutable`. HTML, missing
assets, unversioned models and all private API responses remain `no-store`.
The cache map changes no security headers or API authorization. Verify the
actual template with `python3 scripts/check-us-cache.py` (requires Nginx).
Before a shared gateway reload, retain the existing complete configuration
hashes and backup, validate the staged file with `nginx -t`, and coordinate the
reload with the other services' owner. Check the public cache headers, private
no-store responses and unchanged neighboring hosts after activation. Rollback
uses the exact saved configuration and another validated reload.
