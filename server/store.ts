import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  chmodSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  statfsSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type {
  JobOptions,
  JobPhase,
  JobSnapshot,
  JobState,
  UploadContext,
} from "../src/job-types";
import { errors, type Config } from "./config";
import type { UsageAction, UsageOrigin } from "./usage-daily";

// Asia/Shanghai day, matching every other daily table.
const usageDay = (now: number) =>
  new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
// Job lifecycle events that are one-to-one with usage actions. Start is counted
// when the upload is accepted (see app.ts). "empty" is a
// completed run that found no rows; cancelled runs are neither success nor fail.
const jobUsage: Record<string, UsageAction> = {
  succeeded: "success",
  empty: "success",
  failed: "fail",
  timed_out: "fail",
  exported: "export",
};
export type Job = {
  id: string;
  token_hash: string;
  address_hash: string;
  state: JobState;
  phase: JobPhase;
  progress: number;
  created: number;
  updated: number;
  expires: number;
  bytes: number;
  mime: string;
  options: string;
  error: string | null;
};
export class JobStore {
  db: DatabaseSync;
  key: Buffer;
  constructor(readonly config: Config) {
    mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    chmodSync(config.dataDir, 0o700);
    mkdirSync(join(config.dataDir, "files"), { recursive: true, mode: 0o700 });
    const keyFile = join(config.dataDir, "rate.key");
    if (!existsSync(keyFile))
      writeFileSync(keyFile, randomBytes(32), { mode: 0o600, flag: "wx" });
    this.key = readFileSync(keyFile);
    this.db = new DatabaseSync(join(config.dataDir, "jobs.sqlite"), {
      timeout: 5000,
    });
    chmodSync(join(config.dataDir, "jobs.sqlite"), 0o600);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, address_hash TEXT NOT NULL,
        state TEXT NOT NULL, phase TEXT NOT NULL, progress REAL NOT NULL,
        created INTEGER NOT NULL, updated INTEGER NOT NULL, expires INTEGER NOT NULL,
        bytes INTEGER NOT NULL, mime TEXT NOT NULL, options TEXT NOT NULL, error TEXT);
      CREATE INDEX IF NOT EXISTS job_queue ON jobs(state,created);
      CREATE INDEX IF NOT EXISTS job_expiry ON jobs(expires);
      CREATE TABLE IF NOT EXISTS events (job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        event TEXT NOT NULL, PRIMARY KEY(job_id,event));
      CREATE TABLE IF NOT EXISTS metrics(day TEXT, traffic TEXT, mode TEXT, event TEXT, error TEXT, count INTEGER,
        PRIMARY KEY(day,traffic,mode,event,error));
      CREATE TABLE IF NOT EXISTS rate(address_hash TEXT, bucket INTEGER, count INTEGER,
        PRIMARY KEY(address_hash,bucket));
      CREATE TABLE IF NOT EXISTS upload_context (
        job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
        visitor_id TEXT NOT NULL, network_id TEXT NOT NULL,
        filename TEXT NOT NULL, contact_email TEXT NOT NULL,
        referrer_host TEXT NOT NULL, user_agent TEXT NOT NULL,
        sha256 TEXT NOT NULL DEFAULT '', engine TEXT NOT NULL DEFAULT '',
        result_rows INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS visitor_events (id TEXT PRIMARY KEY, day TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS visitor_counters (
        day TEXT,tool TEXT,source TEXT,traffic TEXT,language TEXT,country TEXT,country_source TEXT,count INTEGER,
        PRIMARY KEY(day,tool,source,traffic,language,country,country_source));
      CREATE TABLE IF NOT EXISTS usage_origin (
        id TEXT PRIMARY KEY, day TEXT NOT NULL, tool TEXT NOT NULL, country TEXT NOT NULL,
        net24 TEXT NOT NULL, ext TEXT NOT NULL, size TEXT NOT NULL, email TEXT NOT NULL,
        internal INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS usage_daily (
        day TEXT NOT NULL, tool TEXT NOT NULL, action TEXT NOT NULL, country TEXT NOT NULL,
        net24 TEXT NOT NULL, ext TEXT NOT NULL, size TEXT NOT NULL, email TEXT NOT NULL,
        internal INTEGER NOT NULL, count INTEGER NOT NULL,
        PRIMARY KEY(day,tool,action,country,net24,ext,size,email,internal));
      CREATE TABLE IF NOT EXISTS visitor_dropped (day TEXT PRIMARY KEY,count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS visitor_context (
        job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS job_record_bytes (
        job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE, bytes INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS reviewed_results (
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, revision INTEGER NOT NULL,
        created INTEGER NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, value TEXT NOT NULL,
        request_id TEXT NOT NULL, PRIMARY KEY(job_id,revision), UNIQUE(job_id,request_id));
      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, address_hash TEXT NOT NULL,
        state TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        bytes INTEGER NOT NULL, metadata_bytes INTEGER NOT NULL, manifest_hash TEXT NOT NULL,
        context TEXT NOT NULL, tool TEXT NOT NULL, mode TEXT NOT NULL, traffic TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS submissions_owner ON submissions(created,id);
      CREATE TABLE IF NOT EXISTS submission_files (
        submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
        slot INTEGER NOT NULL, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
        complete INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(submission_id,slot));`);
    for (const job of this.all()) {
      const result = join(this.dir(job.id), "result.json");
      const bytes =
        4096 +
        (existsSync(result)
          ? statSync(result).size
          : ["uploading", "queued", "processing"].includes(job.state)
            ? 2 * 1024 * 1024
            : 0);
      this.db
        .prepare(
          "INSERT INTO job_record_bytes VALUES(?,?) ON CONFLICT(job_id) DO UPDATE SET bytes=excluded.bytes",
        )
        .run(job.id, bytes);
    }
  }
  dir(id: string) {
    return join(this.config.dataDir, "files", id);
  }
  digest(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
  address(ip: string, now: number) {
    return createHmac("sha256", this.key)
      .update(`${Math.floor(now / 86400_000)}:${ip}`)
      .digest("hex");
  }
  get(id: string): Job | undefined {
    return this.db.prepare("SELECT * FROM jobs WHERE id=?").get(id) as
      Job | undefined;
  }
  authorized(job: { token_hash: string } | undefined, token: string) {
    return (
      !!job &&
      timingSafeEqual(
        Buffer.from(job.token_hash, "hex"),
        Buffer.from(this.digest(token), "hex"),
      )
    );
  }
  all(state?: string) {
    return this.db
      .prepare(
        state
          ? "SELECT * FROM jobs WHERE state=? ORDER BY created"
          : "SELECT * FROM jobs",
      )
      .all(...(state ? [state] : [])) as Job[];
  }
  context(id: string, ip: string, value: UploadContext, userAgent: string) {
    const networkId = createHmac("sha256", this.key)
      .update("network:" + ip)
      .digest("hex");
    this.db
      .prepare(
        "INSERT INTO upload_context(job_id,visitor_id,network_id,filename,contact_email,referrer_host,user_agent) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        id,
        value.visitorId,
        networkId,
        value.filename,
        value.contactEmail,
        value.referrerHost,
        userAgent.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 256),
      );
  }
  // Derived, non-identifying attributes captured at upload so later lifecycle
  // events (no request, no address) can be counted in usage_daily.
  usageOriginSet(id: string, o: UsageOrigin, now = Date.now()) {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO usage_origin VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(id, usageDay(now), o.tool, o.country, o.net24, o.ext, o.size, o.email, o.internal);
  }
  usageBump(o: UsageOrigin, action: UsageAction, now = Date.now()) {
    this.db
      .prepare(
        "INSERT INTO usage_daily VALUES(?,?,?,?,?,?,?,?,?,1) ON CONFLICT(day,tool,action,country,net24,ext,size,email,internal) DO UPDATE SET count=count+1",
      )
      .run(usageDay(now), o.tool, action, o.country, o.net24, o.ext, o.size, o.email, o.internal);
  }
  usageFor(id: string, action: UsageAction, now = Date.now()) {
    const o = this.db.prepare("SELECT * FROM usage_origin WHERE id=?").get(id) as
      | UsageOrigin
      | undefined;
    if (o) this.usageBump(o, action, now);
  }
  sourceDigest(id: string, digest: string) {
    this.db
      .prepare("UPDATE upload_context SET sha256=? WHERE job_id=?")
      .run(digest, id);
  }
  releaseReservation(id: string) {
    this.db.prepare("UPDATE jobs SET bytes=0 WHERE id=?").run(id);
  }
  recognized(id: string, engine: unknown, rows: number) {
    this.db
      .prepare(
        "UPDATE upload_context SET engine=?,result_rows=? WHERE job_id=?",
      )
      .run(JSON.stringify(engine || {}), rows, id);
  }
  storedBytes() {
    return (
      this.db
        .prepare(
          "SELECT COALESCE(SUM(bytes),0) bytes FROM (SELECT bytes FROM jobs UNION ALL SELECT bytes FROM submissions UNION ALL SELECT bytes FROM reviewed_results UNION ALL SELECT bytes FROM job_record_bytes)",
        )
        .get() as { bytes: number }
    ).bytes;
  }
  // Only pending records reserve future physical bytes. Account for bytes already
  // written to source/scratch files so concurrent streams cannot spend the same
  // free space. The pending-record cap keeps these filesystem checks bounded.
  outstandingBytes() {
    const size = (path: string) => (existsSync(path) ? statSync(path).size : 0);
    let remaining = 0;
    for (const job of this.all().filter((j) =>
      ["uploading", "queued", "processing"].includes(j.state),
    )) {
      const record = this.db
        .prepare("SELECT bytes FROM job_record_bytes WHERE job_id=?")
        .get(job.id) as { bytes: number };
      remaining += Math.max(
        0,
        job.bytes -
          size(join(this.dir(job.id), "source")) -
          size(join(this.dir(job.id), "upload.part")),
      );
      remaining += Math.max(
        0,
        record.bytes - size(join(this.dir(job.id), "result.json")),
      );
    }
    for (const row of this.db
      .prepare("SELECT id,bytes FROM submissions WHERE state='uploading'")
      .all() as { id: string; bytes: number }[]) {
      const dir = join(this.config.dataDir, "submissions", row.id);
      let written = size(join(dir, "record.json"));
      for (const file of this.db
        .prepare("SELECT slot FROM submission_files WHERE submission_id=?")
        .all(row.id)) {
        written +=
          size(join(dir, String(file.slot))) +
          size(join(dir, `${file.slot}.part`));
      }
      remaining += Math.max(0, row.bytes - written);
    }
    return remaining;
  }
  freeBytes() {
    const disk = statfsSync(this.config.dataDir);
    return disk.bavail * disk.bsize;
  }
  hasPhysicalSpace(additional = 0) {
    return (
      this.freeBytes() - this.outstandingBytes() - additional >=
      this.config.minFreeBytes
    );
  }
  reserveCheck(address: string, bytes: number, now = Date.now()) {
    const bucket = Math.floor(now / 3600_000);
    const rate = this.db
      .prepare("SELECT count FROM rate WHERE address_hash=? AND bucket>=?")
      .all(address, bucket - 1) as { count: number }[];
    if (
      rate.reduce((sum, row) => sum + row.count, 0) >= this.config.hourlyLimit
    )
      return "rate_limit";
    const pending = this.db
      .prepare(
        "SELECT COUNT(*) n, COALESCE(SUM(address_hash=?),0) own FROM (SELECT address_hash FROM jobs WHERE state IN ('uploading','queued','processing') UNION ALL SELECT address_hash FROM submissions WHERE state='uploading')",
      )
      .get(address) as { n: number; own: number };
    const total = this.db
      .prepare(
        "SELECT COALESCE(SUM(bytes),0) bytes FROM (SELECT bytes FROM jobs UNION ALL SELECT bytes FROM submissions UNION ALL SELECT bytes FROM reviewed_results UNION ALL SELECT bytes FROM job_record_bytes)",
      )
      .get() as { bytes: number };
    const count = this.db
      .prepare(
        "SELECT (SELECT COUNT(*) FROM jobs)+(SELECT COUNT(*) FROM submissions) n",
      )
      .get() as { n: number };
    if (
      count.n >= 10000 ||
      pending.n >= this.config.maxPending ||
      pending.own >= this.config.perAddressPending ||
      total.bytes + bytes > this.config.maxStoredBytes ||
      !this.hasPhysicalSpace(bytes)
    )
      return "busy";
    return null;
  }
  create(
    id: string,
    token: string,
    ip: string,
    bytes: number,
    mime: string,
    options: JobOptions,
    now = Date.now(),
  ) {
    const address = this.address(ip, now),
      bucket = Math.floor(now / 3600_000);
    const rejected = this.reserveCheck(
      address,
      bytes + 4096 + 2 * 1024 * 1024,
      now,
    );
    if (rejected) return rejected;
    this.db
      .prepare(
        `INSERT INTO jobs VALUES(?,?,?,'uploading','uploading',0,?,?,?,?,?,?,NULL)`,
      )
      .run(
        id,
        this.digest(token),
        address,
        now,
        now,
        this.config.retentionMs > 0 ? now + this.config.retentionMs : 0,
        bytes,
        mime,
        JSON.stringify(options),
      );
    this.db
      .prepare("INSERT INTO job_record_bytes VALUES(?,?)")
      .run(id, 4096 + 2 * 1024 * 1024);
    this.db
      .prepare(
        "INSERT INTO rate VALUES(?,?,1) ON CONFLICT(address_hash,bucket) DO UPDATE SET count=count+1",
      )
      .run(address, bucket);
    return null;
  }
  update(
    id: string,
    state: JobState,
    phase: JobPhase,
    progress = 0,
    error: string | null = null,
  ) {
    this.db
      .prepare(
        "UPDATE jobs SET state=?, phase=?, progress=?, error=?, updated=? WHERE id=?",
      )
      .run(state, phase, progress, error, Date.now(), id);
  }
  event(
    id: string,
    event: string,
    error = "",
    now = Date.now(),
    change?: () => void,
  ) {
    const job = this.get(id);
    if (!job) return;
    const options: JobOptions = JSON.parse(job.options);
    const day = new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      change?.();
      const inserted = this.db
        .prepare("INSERT OR IGNORE INTO events VALUES(?,?)")
        .run(id, event);
      if (inserted.changes && jobUsage[event])
        this.usageFor(id, jobUsage[event], now);
      if (inserted.changes)
        this.db
          .prepare(
            "INSERT INTO metrics VALUES(?,?,?,?,?,1) ON CONFLICT(day,traffic,mode,event,error) DO UPDATE SET count=count+1",
          )
          .run(day, options.traffic, options.mode, event, error);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  finish(id: string, state: JobState, error: string | null = null) {
    const job = this.get(id);
    if (!job || !["uploading", "queued", "processing"].includes(job.state))
      return;
    this.event(id, state, error || "", Date.now(), () =>
      this.update(id, state, "finished", 1, error),
    );
    const result = join(this.dir(id), "result.json");
    this.db
      .prepare("UPDATE job_record_bytes SET bytes=? WHERE job_id=?")
      .run(4096 + (existsSync(result) ? statSync(result).size : 0), id);
  }
  snapshot(job: Job): JobSnapshot {
    return {
      id: job.id,
      state: job.state,
      phase: job.phase,
      progress: job.progress,
      createdAt: job.created,
      expiresAt: job.expires,
      errorCode: job.error,
      message: job.error ? errors[job.error] || errors.recognition_failed : "",
    };
  }
  purge(id: string) {
    rmSync(this.dir(id), { recursive: true, force: true });
    this.db.prepare("DELETE FROM jobs WHERE id=?").run(id);
  }
  prune(now = Date.now()) {
    this.db
      .prepare("DELETE FROM rate WHERE bucket<?")
      .run(Math.floor(now / 3600_000) - 2);
    this.db
      .prepare("DELETE FROM metrics WHERE day<?")
      .run(new Date(now - 180 * 86400_000).toISOString().slice(0, 10));
    const old = new Date(now - 400 * 86400_000).toISOString().slice(0, 10);
    this.db.prepare("DELETE FROM usage_daily WHERE day<?").run(old);
    this.db.prepare("DELETE FROM usage_origin WHERE day<?").run(old);
  }
  close() {
    this.db.close();
  }
}
