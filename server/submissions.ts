import { usageOrigin } from "./usage-daily";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  openSync,
  closeSync,
  fsyncSync,
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isIP } from "node:net";
import { JobStore } from "./store";
import { TOKEN, UUID } from "./input";
import { visitorContext } from "./visitor-context";
import {
  submissionLimits as limits,
  submissionTools,
  sourceLabels,
} from "../src/submission-types";
import {
  sgSubmissionTools,
  sgPageLanguages,
  sgSubmissionLimits,
  type RetainedManifest,
} from "../src/sg-submission-types";

export class SubmissionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const bad = (message = "Check the submission and attachment limits.") =>
  new SubmissionError(400, "invalid_submission", message);
const absent = () =>
  new SubmissionError(
    404,
    "not_found",
    "This private submission is unavailable.",
  );
type RecordRow = {
  id: string;
  token_hash: string;
  address_hash: string;
  state: string;
  created: number;
  updated: number;
  bytes: number;
  metadata_bytes: number;
  manifest_hash: string;
  context: string;
  tool: string;
  mode: string;
  traffic: string;
};
type FileRow = {
  submission_id: string;
  slot: number;
  bytes: number;
  sha256: string;
  complete: number;
};
let largeJsonReaders = 0;
export async function jsonBody(req: IncomingMessage, max = limits.jsonBytes) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    throw bad("Use a JSON submission.");
  // A few slow 16 MiB requests must not fill the process before storage/rate
  // admission can run. Small visit/review requests retain their own allowance.
  const large = max > limits.jsonBytes;
  if (large && largeJsonReaders >= 2)
    throw new SubmissionError(
      503,
      "unavailable",
      "Saving is busy. Please retry shortly.",
    );
  if (large) largeJsonReaders++;
  const deadline = setTimeout(
    () => req.destroy(new Error("JSON upload timed out.")),
    60000,
  );
  deadline.unref();
  try {
    const parts: Buffer[] = [];
    let received = 0;
    for await (const chunk of req) {
      received += chunk.length;
      if (received > max)
        throw new SubmissionError(
          413,
          "too_large",
          "The submitted text exceeds the allowed storage size.",
        );
      parts.push(chunk);
    }
    const raw = Buffer.concat(parts);
    try {
      return { value: JSON.parse(raw.toString("utf8")), raw };
    } catch {
      throw bad("The submission is not valid JSON.");
    }
  } finally {
    clearTimeout(deadline);
    if (large) largeJsonReaders--;
  }
}
function safeText(v: unknown, max: number) {
  return (
    typeof v === "string" && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v)
  );
}
export function parseManifest(value: unknown, origin = ""): RetainedManifest {
  const v = value as RetainedManifest;
  const sg = v?.v === 2 && origin === "https://mst-sg.com";
  const activeLimits = sg ? sgSubmissionLimits(v.tool) : limits;
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).sort().join(",") !==
      (sg
        ? "contactEmail,files,inputs,mode,pageLanguage,result,source,tool,traffic,v,visitorId"
        : "contactEmail,files,inputs,mode,result,source,tool,traffic,v,visitorId") ||
    (sg
      ? v.v !== 2 ||
        !sgSubmissionTools.includes(v.tool) ||
        !sgPageLanguages.includes(v.pageLanguage)
      : v.v !== 1 || !submissionTools.includes(v.tool)) ||
    !["sample", "provided", "default"].includes(v.mode) ||
    !["test", "browser"].includes(v.traffic) ||
    !sourceLabels.includes(v.source) ||
    !UUID.test(v.visitorId) ||
    !safeText(v.contactEmail, 254) ||
    (v.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.contactEmail)) ||
    !Array.isArray(v.files) ||
    v.files.length > activeLimits.files
  )
    throw bad();
  let total = 0;
  for (const f of v.files) {
    if (
      !f ||
      Object.keys(f).sort().join(",") !==
        "name,relativePath,role,sha256,size" ||
      !safeText(f.role, 80) ||
      !f.role ||
      !safeText(f.name, 240) ||
      !f.name ||
      /[/\\]/.test(f.name) ||
      !safeText(f.relativePath, 1000) ||
      f.relativePath.startsWith("/") ||
      f.relativePath.split(/[\\/]/).some((p) => p === "..") ||
      !Number.isSafeInteger(f.size) ||
      f.size < 0 ||
      f.size > activeLimits.fileBytes ||
      !/^[a-f0-9]{64}$/.test(f.sha256)
    )
      throw bad();
    total += f.size;
  }
  if (total > activeLimits.totalBytes)
    throw new SubmissionError(
      413,
      "too_large",
      "The selected attachments exceed this tool's storage limit.",
    );
  // Keep traversal memory proportional to depth, not array width. A large
  // source string is one node; full log text remains supported.
  let remainingNodes = 1_000_000;
  const inspect = (item: unknown, depth: number) => {
    if (--remainingNodes < 0)
      throw bad("The submission contains too many fields.");
    if (depth > 32) throw bad();
    if (Array.isArray(item)) {
      for (let i = 0; i < item.length; i++) inspect(item[i], depth + 1);
    } else if (item && typeof item === "object") {
      for (const key in item)
        if (Object.hasOwn(item, key))
          inspect((item as Record<string, unknown>)[key], depth + 1);
    }
  };
  inspect(v.inputs, 0);
  inspect(v.result, 0);
  return v;
}
export class SubmissionService {
  readonly uploads = new Map<string, IncomingMessage>();
  constructor(readonly store: JobStore) {
    mkdirSync(join(store.config.dataDir, "submissions"), {
      recursive: true,
      mode: 0o700,
    });
    // Complete files are retained after interruption. Only scratch bytes are discarded.
    for (const row of this.store.db
      .prepare("SELECT * FROM submissions WHERE state!='completed'")
      .all() as RecordRow[]) {
      for (const file of this.files(row.id))
        rmSync(join(this.dir(row.id), `${file.slot}.part`), { force: true });
      this.recoverOriginals(row);
    }
    this.sweep();
  }
  dir(id: string) {
    return join(this.store.config.dataDir, "submissions", id);
  }
  get(id: string) {
    return this.store.db
      .prepare("SELECT * FROM submissions WHERE id=?")
      .get(id) as RecordRow | undefined;
  }
  files(id: string) {
    return this.store.db
      .prepare(
        "SELECT * FROM submission_files WHERE submission_id=? ORDER BY slot",
      )
      .all(id) as FileRow[];
  }
  active(id: string) {
    return [...this.uploads.keys()].some((key) => key.startsWith(id + "/"));
  }
  physicalOriginalBytes(id: string) {
    return this.files(id).reduce((n, f) => {
      const path = join(this.dir(id), String(f.slot));
      return n + (existsSync(path) ? statSync(path).size : 0);
    }, 0);
  }
  recoverOriginals(row: RecordRow) {
    if (this.active(row.id)) return;
    let invalid = false;
    for (const file of this.files(row.id)) {
      if (file.complete === 1) continue;
      const path = join(this.dir(row.id), String(file.slot));
      if (!existsSync(path)) continue;
      const valid =
        statSync(path).size === file.bytes &&
        createHash("sha256").update(readFileSync(path)).digest("hex") ===
          file.sha256;
      this.store.db
        .prepare(
          "UPDATE submission_files SET complete=? WHERE submission_id=? AND slot=?",
        )
        .run(valid ? 1 : -1, row.id, file.slot);
      invalid ||= !valid;
    }
    // Unverified bytes stay private and charged; never delete or serve them as
    // originals. A rename followed by a failed DB commit is repaired above.
    if (invalid || row.state === "interrupted")
      this.store.db
        .prepare(
          "UPDATE submissions SET state='interrupted',bytes=? WHERE id=?",
        )
        .run(row.metadata_bytes + this.physicalOriginalBytes(row.id), row.id);
  }
  sweep(now = Date.now()) {
    for (const row of this.store.db
      .prepare(
        "SELECT * FROM submissions WHERE state='uploading' AND updated<?",
      )
      .all(now - 86400_000) as RecordRow[]) {
      if (this.active(row.id)) continue;
      this.recoverOriginals(row);
      this.store.db
        .prepare(
          "UPDATE submissions SET state='interrupted',bytes=? WHERE id=?",
        )
        .run(row.metadata_bytes + this.physicalOriginalBytes(row.id), row.id);
    }
  }
  close() {
    for (const req of this.uploads.values()) req.destroy();
  }
  snapshot(row: RecordRow) {
    return {
      id: row.id,
      state: row.state,
      createdAt: row.created,
      savedAt: row.state === "completed" ? row.updated : null,
      files: this.files(row.id).map((f) => ({
        slot: f.slot,
        bytes: f.bytes,
        sha256: f.sha256,
        complete: f.complete === 1,
        integrityError: f.complete === -1,
      })),
    };
  }
  async handle(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    closing: boolean,
  ) {
    if (!path.startsWith("/tools-api/v1/submissions")) return false;
    const match =
      /^\/tools-api\/v1\/submissions\/([a-f0-9-]+)(?:\/(finish|record|files\/(\d+)))?$/.exec(
        path,
      );
    if (!match || !UUID.test(match[1])) throw absent();
    const [, id, action, rawSlot] = match;
    const token = String(req.headers.authorization || "").replace(
      /^Bearer /,
      "",
    );
    if (!TOKEN.test(token)) throw absent();
    const json = (status: number, value: unknown) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(value));
    };
    let row = this.get(id);
    if (req.method === "POST" && !action) {
      if (closing)
        throw new SubmissionError(
          503,
          "unavailable",
          "Please try again shortly.",
        );
      if (row && !this.store.authorized(row, token)) throw absent();
      const { value, raw } = await jsonBody(
        req,
        this.store.config.origin === "https://mst-sg.com"
          ? 16 * 1024 * 1024
          : limits.jsonBytes,
      );
      const manifest = parseManifest(value, this.store.config.origin);
      if (manifest.v === 1 && raw.length > limits.jsonBytes)
        throw new SubmissionError(
          413,
          "too_large",
          "The submission text exceeds 2 MB.",
        );
      const digest = this.store.digest(raw.toString("utf8"));
      // Recheck after awaiting the body; another same-ID request may have won.
      row = this.get(id);
      if (row) {
        if (!this.store.authorized(row, token)) throw absent();
        if (row.manifest_hash !== digest)
          throw new SubmissionError(
            409,
            "conflict",
            "Use a new submission for changed inputs.",
          );
        json(200, this.snapshot(row));
        return true;
      }
      const ip = this.store.config.trustProxy
        ? String(req.headers["x-real-ip"] || "")
        : String(req.socket.remoteAddress || "");
      if (!isIP(ip)) throw bad();
      this.sweep();
      const now = Date.now(),
        address = this.store.address(ip, now),
        bucket = Math.floor(now / 3600_000);
      const metadataBytes = raw.length + 4096 + manifest.files.length * 512;
      const bytes =
        metadataBytes + manifest.files.reduce((n, f) => n + f.size, 0);
      const rejected = this.store.reserveCheck(address, bytes, now);
      if (rejected)
        throw new SubmissionError(
          rejected === "rate_limit" ? 429 : 503,
          rejected,
          "Storage is busy or the upload limit was reached. Please try again later.",
        );
      const context = JSON.stringify({
        ...visitorContext(req, this.store.config),
        ...(manifest.v === 2 ? { page_language: manifest.pageLanguage } : {}),
        visitor_id: manifest.visitorId,
        source: manifest.source,
        source_verified: false,
        result_source: "browser_reported",
        contact_verified: false,
      });
      this.store.db.exec("BEGIN IMMEDIATE");
      try {
        mkdirSync(this.dir(id), { mode: 0o700 });
        writeFileSync(join(this.dir(id), "record.json"), raw, {
          mode: 0o600,
          flag: "wx",
          flush: true,
        });
        this.store.db
          .prepare(
            "INSERT INTO submissions(id,token_hash,address_hash,state,created,updated,bytes,metadata_bytes,manifest_hash,context,tool,mode,traffic) VALUES(?,?,?,'uploading',?,?,?,?,?,?,?,?,?)",
          )
          .run(
            id,
            this.store.digest(token),
            address,
            now,
            now,
            bytes,
            metadataBytes,
            digest,
            context,
            manifest.tool,
            manifest.mode,
            manifest.traffic,
          );
        for (let slot = 0; slot < manifest.files.length; slot++) {
          const f = manifest.files[slot];
          this.store.db
            .prepare("INSERT INTO submission_files VALUES(?,?,?,?,0)")
            .run(id, slot, f.size, f.sha256);
        }
        this.store.db
          .prepare(
            "INSERT INTO rate VALUES(?,?,1) ON CONFLICT(address_hash,bucket) DO UPDATE SET count=count+1",
          )
          .run(address, bucket);
        const first = manifest.files[0];
        const origin = usageOrigin(this.store, req, ip, {
          tool: manifest.tool,
          filename: first?.name,
          bytes: manifest.files.reduce((n, f) => n + f.size, 0) || undefined,
          hasEmail: !!manifest.contactEmail,
          traffic: manifest.traffic,
        });
        this.store.usageOriginSet(id, origin, now);
        this.store.usageBump(origin, "start", now);
        this.store.db.exec("COMMIT");
      } catch (error) {
        this.store.db.exec("ROLLBACK");
        rmSync(this.dir(id), { recursive: true, force: true });
        throw error;
      }
      json(201, this.snapshot(this.get(id)!));
      return true;
    }
    if (!row || !this.store.authorized(row, token)) throw absent();
    if (req.method === "GET" && !action) {
      json(200, this.snapshot(row));
      return true;
    }
    if (req.method === "DELETE" && !action) {
      if (this.active(id))
        throw new SubmissionError(
          409,
          "busy",
          "Wait for the active upload before deleting.",
        );
      rmSync(this.dir(id), { recursive: true, force: true });
      this.store.db.prepare("DELETE FROM submissions WHERE id=?").run(id);
      res.writeHead(204);
      res.end();
      return true;
    }
    if (req.method === "GET" && action === "record") {
      json(200, {
        ...this.snapshot(row),
        submission: JSON.parse(
          readFileSync(join(this.dir(id), "record.json"), "utf8"),
        ),
        context: JSON.parse(row.context),
      });
      return true;
    }
    if (action?.startsWith("files/")) {
      this.recoverOriginals(row);
      row = this.get(id)!;
      const slot = Number(rawSlot),
        file = this.files(id).find((f) => f.slot === slot);
      if (!file || String(slot) !== rawSlot) throw absent();
      const target = join(this.dir(id), String(slot));
      if (req.method === "GET") {
        if (file.complete !== 1) throw absent();
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="attachment-${slot + 1}.bin"`,
          "Content-Length": file.bytes,
          "Content-Security-Policy": "sandbox; default-src 'none'",
        });
        await pipeline(createReadStream(target), res);
        return true;
      }
      if (req.method === "POST") {
        if (file.complete === 1) {
          req.resume();
          json(200, { saved: true, sha256: file.sha256 });
          return true;
        }
        if (row.state !== "uploading")
          throw new SubmissionError(
            409,
            "interrupted",
            "This upload expired. Start a new submission; previously received originals remain stored.",
          );
        const size = Number(req.headers["content-length"]);
        if (
          req.headers["content-length"] === undefined ||
          !Number.isSafeInteger(size) ||
          size !== file.bytes
        )
          throw bad("Attachment size does not match the submitted manifest.");
        if (req.headers["content-type"] !== "application/octet-stream")
          throw bad();
        const key = `${id}/${slot}`;
        if (this.uploads.has(key))
          throw new SubmissionError(
            409,
            "busy",
            "This attachment is already uploading.",
          );
        this.uploads.set(key, req);
        let received = 0;
        const hash = createHash("sha256"),
          scratch = join(this.dir(id), `${slot}.part`);
        const timer = setTimeout(
          () => req.destroy(),
          this.store.config.uploadTimeoutMs,
        );
        try {
          const store = this.store;
          if (!store.hasPhysicalSpace())
            throw new SubmissionError(
              503,
              "busy",
              "Storage is temporarily full.",
            );
          await pipeline(
            req,
            new Transform({
              transform(chunk: Buffer, _encoding, callback) {
                received += chunk.length;
                hash.update(chunk);
                callback(
                  received > size
                    ? bad()
                    : !store.hasPhysicalSpace()
                      ? new SubmissionError(
                          503,
                          "busy",
                          "Storage is temporarily full.",
                        )
                      : null,
                  chunk,
                );
              },
            }),
            createWriteStream(scratch, {
              mode: 0o600,
              flags: "wx",
              flush: true,
            }),
          );
          if (received !== file.bytes || hash.digest("hex") !== file.sha256)
            throw bad("Attachment integrity check failed. Please retry.");
          const current = this.get(id);
          if (
            !current ||
            current.state !== "uploading" ||
            current.token_hash !== row.token_hash ||
            current.created !== row.created ||
            current.bytes !== row.bytes
          )
            throw new SubmissionError(
              409,
              "interrupted",
              "This upload is no longer active.",
            );
          if (!store.hasPhysicalSpace())
            throw new SubmissionError(
              503,
              "busy",
              "Storage is temporarily full.",
            );
          renameSync(scratch, target);
          const directory = openSync(this.dir(id), "r");
          try {
            fsyncSync(directory);
          } finally {
            closeSync(directory);
          }
          this.store.db
            .prepare(
              "UPDATE submission_files SET complete=1 WHERE submission_id=? AND slot=?",
            )
            .run(id, slot);
          this.store.db
            .prepare("UPDATE submissions SET updated=? WHERE id=?")
            .run(Date.now(), id);
          json(200, { saved: true, sha256: file.sha256 });
        } finally {
          clearTimeout(timer);
          this.uploads.delete(key);
          rmSync(scratch, { force: true });
        }
        return true;
      }
    }
    if (req.method === "POST" && action === "finish") {
      if (row.state === "completed") {
        json(200, this.snapshot(row));
        return true;
      }
      if (
        row.state !== "uploading" ||
        this.files(id).some((f) => f.complete !== 1)
      )
        throw new SubmissionError(
          409,
          "not_ready",
          "Some attachments have not finished uploading.",
        );
      this.store.db
        .prepare(
          "UPDATE submissions SET state='completed',updated=? WHERE id=?",
        )
        .run(Date.now(), id);
      // The result is browser-reported; "failed" is the client's own status.
      let status = "";
      try {
        status = String(
          JSON.parse(readFileSync(join(this.dir(id), "record.json"), "utf8"))
            ?.result?.status,
        );
      } catch {
        /* Unreadable record: count neither outcome. */
      }
      if (status === "succeeded") this.store.usageFor(id, "success");
      else if (status === "failed") this.store.usageFor(id, "fail");
      json(200, this.snapshot(this.get(id)!));
      return true;
    }
    throw absent();
  }
}
