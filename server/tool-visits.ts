import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";
import type { JobStore } from "./store";
import { jsonBody, SubmissionError } from "./submissions";
import { sourceLabels, submissionTools } from "../src/submission-types";
import { UUID } from "./input";
import { visitorContext } from "./visitor-context";
const rates = new Map<string, { until: number; count: number }>();
export async function recordToolVisit(
  store: JobStore,
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (req.method !== "POST")
    throw new SubmissionError(405, "forbidden", "POST required.");
  if (req.headers.dnt === "1" || req.headers["sec-gpc"] === "1") {
    req.resume();
    res.writeHead(204);
    res.end();
    return;
  }
  const { value } = await jsonBody(req, 1024);
  if (
    !value ||
    Object.keys(value).sort().join(",") !== "eventId,source,tool,traffic,v" ||
    value.v !== 1 ||
    !UUID.test(value.eventId) ||
    ![...submissionTools, "directory"].includes(value.tool) ||
    !sourceLabels.includes(value.source) ||
    !["browser", "test"].includes(value.traffic)
  )
    throw new SubmissionError(400, "invalid_visit", "Invalid visit.");
  const ip = store.config.trustProxy
    ? String(req.headers["x-real-ip"] || "")
    : String(req.socket.remoteAddress || "");
  if (!isIP(ip))
    throw new SubmissionError(400, "invalid_visit", "Invalid visit.");
  const now = Date.now(),
    key = store.address(ip, now),
    day = new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
  const rate = rates.get(key);
  if (rate && rate.until > now && rate.count >= 90) {
    res.writeHead(204);
    res.end();
    return;
  }
  if (rate && rate.until > now) rate.count++;
  else rates.set(key, { until: now + 60000, count: 1 });
  if (rates.size > 5000)
    for (const [k, v] of rates) if (v.until <= now) rates.delete(k);
  if (rates.size > 5000) {
    res.writeHead(204);
    res.end();
    return;
  }
  const context = visitorContext(req, store.config);
  store.db
    .prepare("DELETE FROM visitor_events WHERE day<?")
    .run(new Date(now - 86400_000).toISOString().slice(0, 10));
  const count = store.db
    .prepare("SELECT COUNT(*) n FROM visitor_events WHERE day=?")
    .get(day) as { n: number };
  const groups = store.db
    .prepare("SELECT COUNT(*) n FROM visitor_counters")
    .get() as { n: number };
  if (count.n >= 50000 || groups.n >= 100000) {
    store.db
      .prepare(
        "INSERT INTO visitor_dropped VALUES(?,1) ON CONFLICT(day) DO UPDATE SET count=count+1",
      )
      .run(day);
    res.writeHead(204);
    res.end();
    return;
  }
  store.db.exec("BEGIN IMMEDIATE");
  try {
    if (
      store.db
        .prepare("INSERT OR IGNORE INTO visitor_events VALUES(?,?)")
        .run(value.eventId, day).changes
    )
      store.db
        .prepare(
          "INSERT INTO visitor_counters VALUES(?,?,?,?,?,?,?,1) ON CONFLICT(day,tool,source,traffic,language,country,country_source) DO UPDATE SET count=count+1",
        )
        .run(
          day,
          value.tool,
          value.source,
          value.traffic,
          context.browser_language,
          context.country,
          context.country_source,
        );
    store.db.exec("COMMIT");
  } catch (e) {
    store.db.exec("ROLLBACK");
    throw e;
  }
  res.writeHead(204);
  res.end();
}
