import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { JobStore } from "./store";
import type { SubmissionService } from "./submissions";
import { SubmissionError } from "./submissions";
import { UUID } from "./input";
import { latestReviewed } from "./reviewed-results";

// Called only after authenticated gateway peer validation. This prefix is
// reachable through a loopback-only operator proxy, never a public vhost.
export async function operatorRequest(
  store: JobStore,
  submissions: SubmissionService,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  if (!url.pathname.startsWith("/tools-operator/")) return false;
  const supplied = String(req.headers["x-mst-operator-token"] || "");
  if (
    !store.config.gatewayToken ||
    !store.config.operatorToken ||
    req.method !== "GET" ||
    req.headers.origin ||
    req.headers["sec-fetch-site"] ||
    !timingSafeEqual(
      createHash("sha256").update(supplied).digest(),
      createHash("sha256").update(store.config.operatorToken).digest(),
    )
  )
    throw new SubmissionError(
      403,
      "forbidden",
      "Private operator access required.",
    );
  const json = (value: unknown) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(value));
  };
  if (url.pathname === "/tools-operator/v1/visits") {
    const start = url.searchParams.get("start") || "",
      end = url.searchParams.get("end") || "";
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
      start > end ||
      [...url.searchParams.keys()].some((k) => !["start", "end"].includes(k))
    )
      throw new SubmissionError(400, "invalid_query", "Use a date range.");
    json({
      schema: 1,
      timezone: "UTC+08:00",
      start,
      end,
      rows: store.db
        .prepare(
          "SELECT * FROM visitor_counters WHERE day>=? AND day<=? AND traffic='browser' ORDER BY day,tool,source",
        )
        .all(start, end),
      dropped: store.db
        .prepare("SELECT * FROM visitor_dropped WHERE day>=? AND day<=?")
        .all(start, end),
      definition:
        "Page views, not people. Preferred request language, estimated network country, page language en; source labels are unverified. Test rows excluded.",
    });
    return true;
  }
  if (url.pathname === "/tools-operator/v1/records") {
    if (
      [...url.searchParams.keys()].some(
        (k) => !["offset", "show_tests"].includes(k),
      )
    )
      throw new SubmissionError(400, "invalid_query", "Invalid query.");
    const raw = url.searchParams.get("offset") || "0",
      offset = Number(raw);
    if (!/^(0|[1-9][0-9]{0,4})$/.test(raw) || offset > 10000)
      throw new SubmissionError(400, "invalid_query", "Invalid page.");
    const tests = url.searchParams.get("show_tests") === "1";
    const rows = store.db
      .prepare(
        `SELECT * FROM (
      SELECT 'job' kind,j.id,j.created,j.updated,j.state,j.bytes,'drawing-to-bom' tool,
        json_extract(j.options,'$.mode') mode,json_extract(j.options,'$.traffic') traffic,
        COALESCE(v.value,'null') context,COALESCE(c.filename,'') filename
        FROM jobs j LEFT JOIN upload_context c ON c.job_id=j.id LEFT JOIN visitor_context v ON v.job_id=j.id
      UNION ALL SELECT 'submission' kind,id,created,updated,state,bytes,tool,mode,traffic,context,'' filename FROM submissions
    ) WHERE (? OR traffic='browser') ORDER BY created DESC,kind,id DESC LIMIT 51 OFFSET ?`,
      )
      .all(tests ? 1 : 0, offset);
    json({
      schema: 1,
      records: rows
        .slice(0, 50)
        .map((r) => ({ ...r, context: JSON.parse(String(r.context)) })),
      nextOffset: rows.length > 50 ? offset + 50 : null,
      testsIncluded: tests,
      identityNotice:
        "Anonymous identifiers and self-reported contact details do not establish identity.",
    });
    return true;
  }
  const match =
    /^\/tools-operator\/v1\/(job|submission)\/([a-f0-9-]+)(?:\/(files\/(\d+)|reviewed\/(\d+)))?$/.exec(
      url.pathname,
    );
  if (!match || !UUID.test(match[2]) || url.search)
    throw new SubmissionError(404, "not_found", "Record unavailable.");
  const [, kind, id, action, slotRaw, revisionRaw] = match;
  let detail: unknown,
    filePath = "",
    fileDigest = "";
  if (kind === "job") {
    const job = store.get(id);
    if (!job)
      throw new SubmissionError(404, "not_found", "Record unavailable.");
    const context = store.db
      .prepare(
        "SELECT visitor_id,filename,contact_email,referrer_host,sha256,engine,result_rows FROM upload_context WHERE job_id=?",
      )
      .get(id);
    const visitor = store.db
      .prepare("SELECT value FROM visitor_context WHERE job_id=?")
      .get(id);
    if (action?.startsWith("reviewed/")) {
      const reviewed = store.db
        .prepare(
          "SELECT revision,created,sha256,value FROM reviewed_results WHERE job_id=? AND revision=?",
        )
        .get(id, Number(revisionRaw));
      if (!reviewed)
        throw new SubmissionError(404, "not_found", "Version unavailable.");
      json({
        revision: reviewed.revision,
        savedAt: reviewed.created,
        source: "browser_reported",
        value: JSON.parse(String(reviewed.value)),
      });
      return true;
    }
    const resultPath = join(store.dir(id), "result.json"),
      sourcePath = join(store.dir(id), "source");
    detail = {
      kind,
      id,
      createdAt: job.created,
      state: job.state,
      error: job.error,
      options: JSON.parse(job.options),
      context: visitor ? JSON.parse(String(visitor.value)) : null,
      upload: context || null,
      contact_verified: false,
      files: existsSync(sourcePath)
        ? [
            {
              slot: 0,
              name: context?.filename || "original",
              bytes: statSync(sourcePath).size,
              sha256: context?.sha256 || "",
              complete: true,
            },
          ]
        : [],
      result: existsSync(resultPath)
        ? JSON.parse(readFileSync(resultPath, "utf8"))
        : null,
      reviewed: latestReviewed(store, id),
      versions: store.db
        .prepare(
          "SELECT revision,created,sha256 FROM reviewed_results WHERE job_id=? ORDER BY revision",
        )
        .all(id),
    };
    if (slotRaw === "0") {
      filePath = sourcePath;
      fileDigest = String(context?.sha256 || "");
    }
  } else {
    const row = submissions.get(id);
    if (!row)
      throw new SubmissionError(404, "not_found", "Record unavailable.");
    if (action?.startsWith("reviewed/"))
      throw new SubmissionError(404, "not_found", "Version unavailable.");
    const manifest = JSON.parse(
      readFileSync(join(submissions.dir(id), "record.json"), "utf8"),
    );
    const files = submissions
      .files(id)
      .map((f) => ({
        ...manifest.files[f.slot],
        slot: f.slot,
        complete: f.complete === 1,
        integrityError: f.complete === -1,
      }));
    detail = {
      kind,
      ...submissions.snapshot(row),
      tool: row.tool,
      context: JSON.parse(row.context),
      submission: manifest,
      files,
    };
    const file = submissions
      .files(id)
      .find((f) => String(f.slot) === slotRaw && f.complete === 1);
    if (file) {
      filePath = join(submissions.dir(id), String(file.slot));
      fileDigest = file.sha256;
    }
  }
  if (!action) {
    json(detail);
    return true;
  }
  if (!filePath || !existsSync(filePath))
    throw new SubmissionError(404, "not_found", "Original unavailable.");
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="mst-original-${id}-${slotRaw}.bin"`,
    "Content-Length": statSync(filePath).size,
    "X-MST-File-SHA256": fileDigest,
    "Content-Security-Policy": "sandbox; default-src 'none'",
  });
  await pipeline(createReadStream(filePath), res);
  return true;
}
