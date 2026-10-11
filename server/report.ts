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
    },
    null,
    2,
  ),
);
db.close();
