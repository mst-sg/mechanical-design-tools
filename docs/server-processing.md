# Drawing-to-BOM server processing

Drawing-to-BOM uploads the original PNG/JPEG/PDF only when the visitor chooses **Extract BOM**. The selected PDF page and crop are sent as bounded options. The service uses the same table extraction rules with preinstalled Tesseract language assets; it does not infer unseen parts or use an external model provider. Other tools retain their current browser processing.

The original and recognized result are private temporary files. No filenames are stored. A 256-bit random bearer capability, held in the current tab's session storage, is required for every status, result, acknowledgement, cancellation and deletion request. It is never put in links. Reloading that tab restores the job. Closing the tab loses that capability; automatic deletion still applies. Starting another input replaces the tab's current job, while any earlier job expires automatically.

Files/results expire after 24 hours; API access stops at expiry. The running service sweeps every five seconds and a separate minute timer removes expired data even while job processing is stopped. A complete host shutdown delays physical deletion until it returns; overdue jobs are never made accessible on restart. No job file backups or training use are configured. Immediate deletion removes the original, output and capability record. Reviewed rows already displayed in the browser remain until that tab is closed or another drawing is selected.

## Operational records

SQLite records uploading, queued, processing, succeeded, empty, failed, timed_out and cancelled. A terminal error contains a fixed code, never parser output. Result fetched, displayed and export acknowledgements are distinct and idempotent. Empty results do not count as a usable BOM. These are operations/attempts, not people or verified customers. Client display acknowledgement is best effort if its network connection disappears.

Daily UTC+8 aggregates contain only date, test/browser category, sample/provided mode, event, fixed error code and count. They survive file deletion for 180 days. Job capabilities/identifiers are absent from aggregates. Short-lived keyed network hashes enforce quotas without retaining raw addresses in the database; request metadata may still be present in normal web-server access logs.

Run `MST_JOBS_DATA=/private/data node server-dist/report.mjs YYYY-MM-DD` for read-only counts. QA must send `traffic:test` and is reported separately. Marking a run as QA does not bypass resource limits. Existing optional page/usage analytics and its GPC/DNT choices remain separate; the operational record delivers and diagnoses the explicitly requested job.

## Local development and verification

Use Node 24. `npm ci`, `npm run build`, `npm test`, `npm run test:e2e`. The browser harness starts preview on 4173 and a test-only job host on 4174. Its fixtures contain no customer information. The test host is not a production entrypoint.

Server tests cover original-byte persistence and actual PNG/PDF OCR, access isolation, same-origin mutation checks, limits, bad input, worker faults, timeout, queue recovery, expiry and deletion. Browser tests cover row review/export, cancellation, server-result restoration, failure feedback and mobile controls. Exact expected rows are required; a visible page or a successful HTTP response alone is insufficient.

## Production deployment

Publish the exact passing CI static artifact and `mechanical-jobs-<SHA>` backend artifact. Verify every manifest digest. Install production dependencies from the exact lockfile in a root-owned, versioned backend directory and pin a separate Node 24 runtime; do not replace the host's system Node. Service code/dependencies are immutable to its unprivileged `mst-tools-jobs` account.

Required environment file:

```text
MST_JOBS_ORIGIN=https://your-canonical-domain
MST_JOBS_DATA=/var/lib/mst-tools-jobs
MST_JOBS_ASSETS=/absolute/exact-static-release/vendor
MST_JOBS_PORT=4174
MST_JOBS_TRUST_PROXY=1
```

The service binds only to loopback. Use the checked `deploy/` systemd units and insert the Nginx fragment only into the canonical site's HTTPS server. The proxy must overwrite the trusted client address and already validate any CDN real-IP header. No wildcard CORS, public listing, original-file URL or generic shared `/api/` route is added. Restrict outbound network access; assets/models must be local. Keep the unrelated website and application routes intact.

Resource defaults: 25 MiB per file, 60 megapixel input image, 8 megapixel recognition image, one worker, 12 total pending jobs, two pending per network address, 20 admissions over current/previous hourly buckets, 1 GiB stored originals, 45-second upload deadline, 90-second worker deadline and approximately two-minute queue bound. The systemd cgroup caps total memory/CPU/tasks. A worker is a separate killed-on-timeout process; it runs without service secrets or ambient application environment. Decoder faults cannot leave an indefinitely pending client job.

Before switching the public frontend, test the backend over loopback with a synthetic fixture and verify private original/result readback, a wrong token, forced failure, expiry timer and no third-party egress. Then switch the static release atomically and perform public desktop/mobile PNG/PDF/result/CSV/delete tests; query the private QA counters. Preserve old static/backend links, environment and Nginx configuration for rollback. On rollback remove only the new route/service, restore the prior static link and retain the cleanup timer for already accepted temporary files; do not delete unrelated data.

References: [Node SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html), [Tesseract API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md), [PDF.js](https://mozilla.github.io/pdf.js/examples/). Library versions are pinned in the repository lockfile.
