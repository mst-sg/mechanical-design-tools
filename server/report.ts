import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
const path = resolve(
  process.env.MST_JOBS_DATA || ".private-jobs",
  "jobs.sqlite",
);
const since =
  process.argv[2] ||
  new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error("Use YYYY-MM-DD");
const db = new DatabaseSync(path, { readOnly: true });
console.log(
  JSON.stringify(
    {
      timezone: "UTC+08:00",
      since,
      counts: db
        .prepare(
          "SELECT * FROM metrics WHERE day>=? ORDER BY day,traffic,mode,event,error",
        )
        .all(since),
      ...(process.argv.includes("--jobs")
        ? {
            identityNotice:
              "Anonymous visitor/network identifiers; contact emails are self-reported and unverified. QA is not real customer usage.",
            jobs: db
              .prepare(
                `SELECT j.id, j.created, j.updated, j.state, j.error, j.bytes, j.mime,
          j.expires, j.options, c.visitor_id, c.network_id, c.filename, c.contact_email,
          c.referrer_host, c.user_agent, c.sha256, c.engine, c.result_rows,
          (SELECT group_concat(event, ',') FROM events e WHERE e.job_id=j.id) events
          FROM jobs j LEFT JOIN upload_context c ON c.job_id=j.id
          WHERE j.created >= ? ORDER BY j.created DESC`,
              )
              .all(Date.parse(since + "T00:00:00+08:00")),
          }
        : {}),
    },
    null,
    2,
  ),
);
db.close();
