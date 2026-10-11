import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  chmodSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
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
} from "../src/job-types";
import { errors, type Config } from "./config";
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
        PRIMARY KEY(address_hash,bucket));`);
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
  authorized(job: Job | undefined, token: string) {
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
    const rate = this.db
      .prepare("SELECT count FROM rate WHERE address_hash=? AND bucket>=?")
      .all(address, bucket - 1) as { count: number }[];
    if (
      rate.reduce((sum, row) => sum + row.count, 0) >= this.config.hourlyLimit
    )
      return "rate_limit";
    const pending = this.db
      .prepare(
        "SELECT COUNT(*) n, COALESCE(SUM(address_hash=?),0) own FROM jobs WHERE state IN ('uploading','queued','processing')",
      )
      .get(address) as { n: number; own: number };
    const total = this.db
      .prepare("SELECT COALESCE(SUM(bytes),0) bytes FROM jobs")
      .get() as { bytes: number };
    if (
      pending.n >= this.config.maxPending ||
      pending.own >= this.config.perAddressPending ||
      total.bytes + bytes > this.config.maxStoredBytes
    )
      return "busy";
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
        now + this.config.retentionMs,
        bytes,
        mime,
        JSON.stringify(options),
      );
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
  }
  close() {
    this.db.close();
  }
}
