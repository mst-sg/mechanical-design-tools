import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { fork, type ChildProcess } from "node:child_process";
import {
  createWriteStream,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { JobStore } from "./store";
import { errors, type Config } from "./config";
import { parseOptions, validMagic, UUID, TOKEN } from "./input";
import { terminal, type JobResult } from "../src/job-types";
import { exportBom } from "../src/csv";

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
export function createJobService(config: Config) {
  const store = new JobStore(config);
  const active = new Map<
    string,
    { child: ChildProcess; timer: NodeJS.Timeout }
  >();
  const uploads = new Map<string, IncomingMessage>();
  let closing = false;
  function json(res: ServerResponse, status: number, value: unknown) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(value));
  }
  function stop(id: string) {
    const run = active.get(id);
    if (run) {
      clearTimeout(run.timer);
      run.child.kill("SIGKILL");
    }
    uploads.get(id)?.destroy();
  }
  function erase(id: string) {
    stop(id);
    const job = store.get(id);
    if (job && !terminal(job.state)) store.finish(id, "cancelled", "cancelled");
    store.purge(id);
  }
  function fail(id: string, code: string) {
    store.finish(
      id,
      code === "timed_out" || code === "queue_timeout" ? "timed_out" : "failed",
      code,
    );
  }
  function sweep(now = Date.now()) {
    for (const job of store.all()) {
      if (job.expires <= now) erase(job.id);
      else if (
        job.state === "queued" &&
        now - job.updated > config.queueTimeoutMs
      )
        fail(job.id, "queue_timeout");
    }
    store.prune(now);
  }
  // Never silently replay a job whose process disappeared. The original and
  // failure remain available until expiry, so the visitor gets a real outcome.
  for (const job of store.all())
    if (!terminal(job.state)) fail(job.id, "interrupted");
  sweep();
  function pump() {
    if (closing) return;
    sweep();
    for (const job of store.all("queued")) {
      if (active.size >= config.concurrency) break;
      store.event(job.id, "processing", "", Date.now(), () =>
        store.update(job.id, "processing", "rendering"),
      );
      const child = fork(config.workerPath, [], {
        cwd: store.dir(job.id),
        execArgv: ["--max-old-space-size=384"],
        env: {
          PATH: dirname(process.execPath),
          NODE_ENV: "production",
          LANG: "C.UTF-8",
          DISABLE_SYSTEM_FONTS_LOAD: "1",
        },
        // Raw parser errors can contain document text. Only fixed error codes
        // and bounded progress/result objects cross this private IPC channel.
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        serialization: "json",
      });
      const timer = setTimeout(() => {
        fail(job.id, "timed_out");
        child.kill("SIGKILL");
      }, config.jobTimeoutMs);
      active.set(job.id, { child, timer });
      let finished = false;
      child.on("message", (message: unknown) => {
        const current = store.get(job.id);
        if (
          !current ||
          current.state !== "processing" ||
          !message ||
          typeof message !== "object"
        )
          return;
        const m = message as {
          type?: string;
          phase?: string;
          progress?: number;
          code?: string;
          result?: JobResult;
        };
        if (
          m.type === "progress" &&
          ["rendering", "loading_model", "recognizing"].includes(
            m.phase || "",
          ) &&
          Number.isFinite(m.progress)
        ) {
          store.update(
            job.id,
            "processing",
            m.phase as "rendering",
            Math.max(0, Math.min(1, m.progress!)),
          );
        } else if (m.type === "error") {
          finished = true;
          fail(
            job.id,
            [
              "invalid_file",
              "invalid_options",
              "too_large",
              "model_unavailable",
              "recognition_failed",
            ].includes(m.code || "")
              ? m.code!
              : "recognition_failed",
          );
          child.kill("SIGKILL");
        } else if (m.type === "result" && m.result) {
          try {
            const result = m.result;
            if (
              !Array.isArray(result.rows) ||
              result.rows.length > 500 ||
              typeof result.text !== "string" ||
              typeof result.message !== "string"
            )
              throw new Error("invalid result");
            const encoded = JSON.stringify(result);
            if (Buffer.byteLength(encoded) > 2 * 1024 * 1024)
              throw new Error("large result");
            writeFileSync(join(store.dir(job.id), "result.json"), encoded, {
              mode: 0o600,
              flag: "wx",
            });
            store.finish(job.id, result.rows.length ? "succeeded" : "empty");
            finished = true;
          } catch {
            fail(job.id, "recognition_failed");
            finished = true;
          }
          child.kill("SIGKILL");
        }
      });
      child.once("error", () => {
        finished = true;
        fail(job.id, "unavailable");
      });
      child.once("close", () => {
        clearTimeout(timer);
        active.delete(job.id);
        if (!finished) fail(job.id, "recognition_failed");
        setImmediate(pump);
      });
      child.send(
        {
          source: join(store.dir(job.id), "source"),
          mime: job.mime,
          options: JSON.parse(job.options),
          assets: config.assetsDir,
        },
        (error) => {
          if (error) {
            fail(job.id, "unavailable");
            child.kill("SIGKILL");
          }
        },
      );
    }
  }
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'",
    );
    try {
      const path = new URL(req.url || "/", "http://local").pathname;
      if (req.method === "GET" && path === "/tools-api/health") {
        return json(res, 200, {
          status: "ok",
          retentionHours: config.retentionMs / 3600_000,
          maxFileBytes: config.maxBytes,
        });
      }
      if (!["GET", "POST", "DELETE"].includes(req.method || ""))
        throw new HttpError(405, "forbidden");
      const origin = req.headers.origin;
      if (
        (origin && origin !== config.origin) ||
        (req.method !== "GET" && origin !== config.origin) ||
        req.headers["sec-fetch-site"] === "cross-site"
      )
        throw new HttpError(403, "forbidden");
      const match =
        /^\/tools-api\/v1\/jobs\/([a-f0-9-]+)(?:\/(result(?:\.csv)?|shown|exported|cancel))?$/.exec(
          path,
        );
      if (!match || !UUID.test(match[1])) throw new HttpError(404, "not_found");
      const [, id, action] = match;
      const auth = req.headers.authorization || "",
        token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!TOKEN.test(token)) throw new HttpError(404, "not_found");
      if (req.method === "POST" && !action) {
        if (closing) throw new HttpError(503, "unavailable");
        const existing = store.get(id);
        if (existing) {
          if (!store.authorized(existing, token))
            throw new HttpError(404, "not_found");
          if (existing.expires <= Date.now()) {
            erase(id);
            throw new HttpError(410, "not_found");
          }
          // A retry with the same capability never creates a duplicate job.
          req.resume();
          return json(res, 200, store.snapshot(existing));
        }
        const size = Number(req.headers["content-length"]);
        if (!Number.isSafeInteger(size) || size <= 0)
          throw new HttpError(411, "invalid_file");
        if (size > config.maxBytes) throw new HttpError(413, "too_large");
        const mime = req.headers["content-type"] || "";
        if (!["image/png", "image/jpeg", "application/pdf"].includes(mime))
          throw new HttpError(415, "invalid_file");
        let options;
        try {
          options = parseOptions(
            String(req.headers["x-mst-job-options"] || ""),
          );
        } catch {
          throw new HttpError(400, "invalid_options");
        }
        sweep();
        const ip = config.trustProxy
          ? String(req.headers["x-real-ip"] || req.socket.remoteAddress)
          : String(req.socket.remoteAddress);
        const rejected = store.create(id, token, ip, size, mime, options);
        if (rejected) {
          res.setHeader("Retry-After", "60");
          throw new HttpError(rejected === "rate_limit" ? 429 : 503, rejected);
        }
        mkdirSync(store.dir(id), { mode: 0o700 });
        uploads.set(id, req);
        let received = 0;
        const limiter = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            received += chunk.length;
            callback(
              received > config.maxBytes || received > size
                ? new Error("too_large")
                : null,
              chunk,
            );
          },
        });
        const timer = setTimeout(
          () => req.destroy(new Error("upload_failed")),
          config.uploadTimeoutMs,
        );
        try {
          await pipeline(
            req,
            limiter,
            createWriteStream(join(store.dir(id), "upload.part"), {
              mode: 0o600,
              flags: "wx",
            }),
          );
          const current = store.get(id);
          if (!current || current.state !== "uploading") return;
          if (
            received !== size ||
            !validMagic(
              readFileSync(join(store.dir(id), "upload.part")).subarray(0, 16),
              mime,
            )
          )
            throw new Error("invalid_file");
          renameSync(
            join(store.dir(id), "upload.part"),
            join(store.dir(id), "source"),
          );
          store.event(id, "upload_received", "", Date.now(), () =>
            store.update(id, "queued", "queued"),
          );
          json(res, 202, store.snapshot(store.get(id)!));
          setImmediate(pump);
        } catch (error) {
          if (store.get(id)?.state === "uploading") {
            const code =
              error instanceof Error &&
              ["invalid_file", "too_large"].includes(error.message)
                ? error.message
                : "upload_failed";
            fail(id, code);
            rmSync(store.dir(id), { force: true, recursive: true });
            if (!res.destroyed) json(res, 422, { code, message: errors[code] });
          }
        } finally {
          clearTimeout(timer);
          uploads.delete(id);
        }
        return;
      }
      const job = store.get(id);
      if (!store.authorized(job, token)) throw new HttpError(404, "not_found");
      if (job!.expires <= Date.now()) {
        erase(id);
        throw new HttpError(410, "not_found");
      }
      if (req.method === "GET" && !action)
        return json(res, 200, store.snapshot(job!));
      if (req.method === "DELETE" && !action) {
        erase(id);
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method === "POST" && action === "cancel") {
        if (!terminal(job!.state)) {
          store.finish(id, "cancelled", "cancelled");
          stop(id);
        }
        return json(res, 200, store.snapshot(store.get(id)!));
      }
      if (!["succeeded", "empty"].includes(job!.state))
        throw new HttpError(409, "not_ready");
      if (
        req.method === "POST" &&
        ["shown", "exported"].includes(action || "")
      ) {
        store.event(id, action === "shown" ? "result_shown" : "exported");
        res.writeHead(204);
        res.end();
        return;
      }
      if (
        req.method === "GET" &&
        (action === "result" || action === "result.csv")
      ) {
        const result: JobResult = JSON.parse(
          readFileSync(join(store.dir(id), "result.json"), "utf8"),
        );
        store.event(id, "result_fetched");
        if (action === "result") return json(res, 200, result);
        store.event(id, "exported");
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="bom-recognized.csv"',
        });
        res.end("\uFEFF" + exportBom(result.rows));
        return;
      }
      throw new HttpError(404, "not_found");
    } catch (error) {
      const known = error instanceof HttpError;
      if (!res.headersSent && !res.destroyed)
        json(res, known ? error.status : 503, {
          code: known ? error.code : "unavailable",
          message: errors[known ? error.code : "unavailable"],
        });
      req.resume();
    }
  });
  server.requestTimeout = config.uploadTimeoutMs + 5000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
  server.maxConnections = 48;
  const cleanup = setInterval(sweep, 5000);
  cleanup.unref();
  return {
    server,
    store,
    sweep,
    pump,
    async close() {
      if (closing) return;
      closing = true;
      clearInterval(cleanup);
      for (const [id] of uploads) {
        fail(id, "interrupted");
        stop(id);
      }
      const waits = [...active.entries()].map(
        ([id, run]) =>
          new Promise<void>((resolve) => {
            run.child.once("close", () => resolve());
            fail(id, "interrupted");
            stop(id);
          }),
      );
      await Promise.all(waits);
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      store.close();
    },
  };
}
