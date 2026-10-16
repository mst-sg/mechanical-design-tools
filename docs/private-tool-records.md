# Private tool records (issue 49)

Running any of the ten tools retains its input values, exact selected originals and browser-reported result in the isolated private US job service. Drawing to BOM also retains immutable GPU OCR and separate reviewed versions. Files selected but never run are not transmitted. Explicit failure states and receipts distinguish saved records from incomplete transfers; refresh/retry never silently claims a save. Samples and QA are classified separately. Existing records without context remain unknown.

The public root tool URLs are script-free edge shells pointing to tools.mst-us.ai. No private API, capability or operator credential is sent to the legacy root server. Deploy all ten exact edge routes only after the private backend and child frontend pass verification. The old DrawingDiff service is a separate application outside these ten tools.

## Storage and recovery

Node 24 / SQLite WAL FULL; originals use 0700 directories and 0600 files. Additive tables preserve prior jobs and rate.key. Shared 20 GiB logical quota includes originals, input/result JSON, pending files, OCR result reservations and reviewed versions; physical admission also deducts outstanding writes above the 2 GiB free-space floor. Maximum 32 files, 25 MiB each, 100 MiB total and 2 MiB JSON per generic submission; 50 reviewed versions per OCR job. At most 10,000 job/submission records. Existing per-network rate and pending caps apply across both paths.

Capability authorization is rechecked after awaited bodies; record IDs are not credentials. Files require exact byte count and SHA-256. Active uploads cannot expire. A verified renamed file is recovered after an interrupted database write; unverifiable files stay private and consume actual capacity. Interrupted records retain received originals and inputs; only missing-file reservations expire after 24 h. Files remain until active visitor/operator deletion. Visitor deletion requires the record capability. No model-training use.

## Owner read access

GET-only /tools-operator/v1/ is reachable through an SG loopback-only Nginx listener, behind gateway peer/token verification and a separate operator-read token. Origin and Sec-Fetch-Site requests are rejected. Do not expose this prefix on a public vhost. SG WordPress handles its existing private-lead permissions and nonce-protected original downloads. The token is named mst-tools-us-operator-read-token in Keychain; provision as MST_JOBS_OPERATOR_READ_TOKEN on the US job service and /etc/mst-sg/us-tools-operator-read.key on the trusted SG host. Never commit these values.

Lists exclude QA by default and return 50 records per page. They expose entered values, immutable raw OCR, reviewed versions and exact original hashes. Browser results/source labels, anonymous IDs and supplied email remain explicitly unverified. Preferred request language and trusted Cloudflare network country are context, not identity. The child page-view ledger is separate and never includes tool inputs/originals; it honors DNT/GPC and reports coverage limits.

## Release and rollback

Use exact successful main CI artifacts for backend, child, edge. Stop admission before a SQLite online snapshot + private-file backup; verify a separate restore and preserve directory modes. Reuse the existing data directory and rate key. Rollback the runtime only with uploads paused: old code does not account for generic records and must not resume admission. Keep the additive data for forward recovery. No periodic/off-host backup claim is made by a one-time release backup.

Focused backend regressions cover old-capability races, cross-record/origin denial, interrupted and corrupt originals, quota races and stream free-space drops. Browser acceptance must include selected files, visible acknowledgement, refresh, original byte-equal download, reviewed edit restore, failure/retry, desktop/mobile and owner-role download rejection. Hosted CI's original no-content-in-analytics assertions remain; authenticated private writes are checked separately.
# SG static engineering tools

The SG service also accepts manifest version 2 for the 22 named static tools in
`src/sg-submission-types.ts`. It requires the configured origin to be exactly
`https://mst-sg.com`, validates the page language (`en`, `zh-CN`, `es`, `ar`, `ja`),
and stores each execution as an immutable private record. Version 1 mechanical
tools retain their existing 25 MiB per-file limit and schema on both services.

Version 2 accepts up to three original files. The report revision checker keeps
its existing 100,000,000-byte layout allowance and a 100,256,000-byte total for
the layout plus two metadata files. Other static tools retain the 25 MiB
per-file ceiling. SG upload streaming has a 300-second deadline; shared disk,
reservation, network rate and concurrency limits still apply. A failed browser
analysis is a saved result, not permission to discard its original files.
Version 2 text is bounded at 16 MiB so the existing million-character log inputs
and their full findings can be retained. Version 1 stays bounded at 2 MiB.
Input/result structures allow at most one million nodes and 32 nesting levels;
large strings do not consume a node per character. Traversal uses depth-bounded
memory. At most two extended JSON bodies can be read concurrently, with a
60-second body deadline; overload returns 503 and allows a later retry.

The SG operator proxy listens only on `127.0.0.1:4185`, uses the existing SG
gateway credential plus a separate operator read credential, and is distinct
from US port 4186. WordPress is responsible for owner roles and download nonces.
Deploy from the exact successful main CI artifact after draining jobs and
verifying a restorable database/file backup. Release code directories must be
0755 for the capability-dropped launcher; private data directories stay 0700.
