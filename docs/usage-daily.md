# Daily usage aggregate

`usage_daily` (SQLite, same database as the jobs service) holds one counter row
per **day (Asia/Shanghai), tool, action, country, /24 hash, extension, size
bucket, has-email, internal**. It exists so the operator can see real use of the
free tools without reading any record.

## Actions

| action        | recorded by | when |
| ------------- | ----------- | ---- |
| `select_file` | browser beacon `POST /tools-api/v1/usage` | a file input changed (first file of the selection) |
| `start`       | server | Drawing to BOM upload accepted; other tools: submission created |
| `success`     | server | job `succeeded` or `empty` (completed, no rows); submission finished with browser-reported `succeeded` |
| `fail`        | server | job `failed` or `timed_out`; submission finished with browser-reported `failed` |
| `export`      | server for Drawing to BOM (`exported` event), browser beacon for the other tools |

Cancelled jobs count only as `start`. `select_file` and the browser `export`
beacon honour Do Not Track / Global Privacy Control and the internal-traffic
localStorage flag, exactly like page visits. Beacon events are deduplicated by
event id for one day.

## What is stored

* `country`: edge country from the authenticated gateway (empty if unknown).
* `net24`: first 16 hex of HMAC-SHA-256(`rate.key`, `/24`) for IPv4 (`/48` for
  IPv6). Keyed with the data-directory secret, so it cannot be reversed offline
  and changes if that key is replaced.
* `ext`: lower-case extension from a fixed allow-list, otherwise `other`/`none`.
* `size`: `<10KB`, `10-100KB`, `100KB-1MB`, `1-10MB`, `>10MB`, `unknown`.
* `email`: `yes`/`no` whether a contact email was supplied; `unknown` for browser beacons.
* `internal`: `1` for `traffic=test`, QA user agents (Playwright, HeadlessChrome,
  curl, "MST retained-tool QA") or a source in `MST_TOOLS_INTERNAL_NETS`.

Never stored: file names, contents, email addresses, IP addresses, visitor ids,
user agents. `usage_origin` keeps the same derived attributes per job/submission
id so later lifecycle events can be counted; both tables are pruned after 400 days.

## Configuration

`MST_TOOLS_INTERNAL_NETS` — comma-separated IPv4 `/24` networks to flag internal,
for example `198.51.100.0/24,203.0.113.0/24`. Optional; unset means only
test traffic and QA user agents are flagged. Changing it needs a service restart.

## Reading it

`GET /tools-operator/v1/usage-daily?start=YYYY-MM-DD&end=YYYY-MM-DD` on the
operator proxy (same token and loopback-only rules as the other operator
endpoints) returns the rows unmodified. External usage is `internal = 0`.

## Rollback

The change is additive (two new tables created with `IF NOT EXISTS`, no existing
column touched). Rolling the runtime back to the previous artifact simply
ignores the tables; keep them. Follow the rollback section of
`deploy/US-DRAWING-BOM.md` (uploads paused, snapshot first).
