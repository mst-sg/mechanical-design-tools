import type { IncomingMessage } from "node:http";
import type { BomRow } from "../src/types";
import type { JobStore, Job } from "./store";
import { jsonBody, SubmissionError } from "./submissions";
import { UUID } from "./input";
export type ReviewedResult = {
  v: 1;
  rows: BomRow[];
  source: "browser_reported";
  revision: number;
  savedAt: number;
};
export function latestReviewed(
  store: JobStore,
  id: string,
): ReviewedResult | null {
  const row = store.db
    .prepare(
      "SELECT revision,created,value FROM reviewed_results WHERE job_id=? ORDER BY revision DESC LIMIT 1",
    )
    .get(id) as
    { revision: number; created: number; value: string } | undefined;
  return row
    ? {
        v: 1,
        rows: JSON.parse(row.value).rows,
        source: "browser_reported",
        revision: row.revision,
        savedAt: row.created,
      }
    : null;
}
export async function saveReviewed(
  store: JobStore,
  original: Job,
  token: string,
  req: IncomingMessage,
) {
  const id = original.id;
  const { value } = await jsonBody(req);
  const current = store.get(id);
  if (
    !current ||
    !store.authorized(current, token) ||
    current.token_hash !== original.token_hash ||
    current.created !== original.created ||
    (current.expires > 0 && current.expires <= Date.now())
  )
    throw new SubmissionError(404, "not_found", "This job is unavailable.");
  if (!["succeeded", "empty"].includes(current.state))
    throw new SubmissionError(409, "not_ready", "The result is not ready yet.");
  if (
    !value ||
    Object.keys(value).sort().join(",") !== "requestId,rows,v" ||
    value.v !== 1 ||
    !UUID.test(value.requestId) ||
    !Array.isArray(value.rows) ||
    value.rows.length > 500 ||
    value.rows.some(
      (row: BomRow) =>
        !row ||
        Object.keys(row).sort().join(",") !==
          "description,id,item,material,partNumber,quantity" ||
        Object.values(row).some(
          (v) =>
            typeof v !== "string" ||
            v.length > 10000 ||
            /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),
        ),
    )
  )
    throw new SubmissionError(
      400,
      "invalid_review",
      "Check the reviewed rows; at most 500 rows are supported.",
    );
  const encoded = JSON.stringify(value),
    digest = store.digest(encoded),
    bytes = Buffer.byteLength(encoded) + 512;
  const same = store.db
    .prepare(
      "SELECT revision,sha256 FROM reviewed_results WHERE job_id=? AND request_id=?",
    )
    .get(id, value.requestId) as
    { revision: number; sha256: string } | undefined;
  if (same) {
    if (same.sha256 !== digest)
      throw new SubmissionError(
        409,
        "conflict",
        "Changed rows require a new review request.",
      );
    return { saved: true, revision: same.revision };
  }
  const count = store.db
    .prepare("SELECT COUNT(*) n FROM reviewed_results WHERE job_id=?")
    .get(id) as { n: number };
  const total = store.storedBytes();
  if (
    count.n >= 50 ||
    total + bytes > store.config.maxStoredBytes ||
    !store.hasPhysicalSpace(bytes)
  )
    throw new SubmissionError(
      503,
      "busy",
      "This job cannot save another version right now. Keep your draft and try again later.",
    );
  // No await between capacity check and the durable insert. Same-request retries
  // reuse the existing version and never rewrite the immutable OCR result.
  store.db
    .prepare("INSERT INTO reviewed_results VALUES(?,?,?,?,?,?,?)")
    .run(id, count.n + 1, Date.now(), digest, bytes, encoded, value.requestId);
  return { saved: true, revision: count.n + 1 };
}
