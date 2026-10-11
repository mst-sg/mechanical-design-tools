import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createJobService } from "../server/app";
import { configuration, type Config } from "../server/config";
import { paddleDouble } from "./fixtures/paddle-double";
import type { JobSnapshot, JobResult } from "../src/job-types";
const options = {
  page: 1,
  crop: { left: 3, top: 50, width: 94, height: 42 },
  language: "eng",
  mode: "provided",
  traffic: "test",
};
const tiny = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0,
  0, 1,
]);
async function fixture(
  t: test.TestContext,
  overrides: Partial<Config> = {},
  worker = "success",
) {
  const root = mkdtempSync(join(tmpdir(), "mst-job-test-"));
  const workerPath = join(root, "fixture-worker.mjs");
  writeFileSync(
    workerPath,
    `process.once('message',()=>{${worker === "hang" ? "setInterval(()=>{},1000)" : worker === "error" ? "process.send({type:'error',code:'model_unavailable'})" : "process.send({type:'result',result:{rows:[{id:'1',partNumber:'FIXTURE',description:'Test',quantity:'2',item:'1',material:'Steel'}],text:'Synthetic',message:'Review'}})"}});`,
  );
  const config = configuration({
    dataDir: join(root, "data"),
    assetsDir: resolve("public/vendor"),
    workerPath,
    jobTimeoutMs: 5000,
    hourlyLimit: 100,
    ...overrides,
  });
  const app = createJobService(config);
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", () => r()));
  const address = app.server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });
  const access = () => ({
    id: randomUUID(),
    token: randomBytes(32).toString("hex"),
  });
  const req = (
    a: ReturnType<typeof access>,
    method = "GET",
    suffix = "",
    body?: Buffer,
    headers: Record<string, string> = {},
  ) =>
    fetch(`${base}/tools-api/v1/jobs/${a.id}${suffix}`, {
      method,
      headers: {
        Origin: config.origin,
        Authorization: `Bearer ${a.token}`,
        ...(body
          ? {
              "Content-Type": "image/png",
              "X-MST-Job-Options": JSON.stringify(options),
            }
          : {}),
        ...headers,
      },
      body: body as unknown as BodyInit,
    });
  const done = async (a: ReturnType<typeof access>) => {
    for (let n = 0; n < 180; n++) {
      const r = await req(a);
      assert.equal(r.status, 200);
      const j = (await r.json()) as JobSnapshot;
      if (
        ["succeeded", "empty", "failed", "timed_out", "cancelled"].includes(
          j.state,
        )
      )
        return j;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("job did not finish");
  };
  return { app, config, root, base, access, req, done };
}
test("private original/result, capability isolation, origin, result acknowledgements and deletion", async (t) => {
  const f = await fixture(t),
    a = f.access();
  assert.equal((await f.req(a, "POST", "", tiny)).status, 202);
  assert.deepEqual(readFileSync(join(f.app.store.dir(a.id), "source")), tiny);
  assert.equal(
    statSync(join(f.app.store.dir(a.id), "source")).mode & 0o777,
    0o600,
  );
  for (const [method, suffix] of [
    ["GET", ""],
    ["GET", "/result"],
    ["GET", "/result.csv"],
    ["POST", "/shown"],
    ["POST", "/cancel"],
    ["DELETE", ""],
  ])
    assert.equal(
      (await f.req({ ...a, token: f.access().token }, method, suffix)).status,
      404,
    );
  assert.equal(
    (
      await f.req(a, "DELETE", "", undefined, {
        Origin: "https://unrelated.invalid",
      })
    ).status,
    403,
  );
  assert.equal((await f.done(a)).state, "succeeded");
  const r = await f.req(a, "GET", "/result");
  assert.match(r.headers.get("cache-control")!, /no-store/);
  assert.equal(((await r.json()) as JobResult).rows[0].partNumber, "FIXTURE");
  for (let n = 0; n < 2; n++) {
    assert.equal((await f.req(a, "POST", "/shown")).status, 204);
    assert.equal((await f.req(a, "GET", "/result.csv")).status, 200);
  }
  const metrics = f.app.store.db
    .prepare("SELECT event,count FROM metrics ORDER BY event")
    .all();
  assert.ok(metrics.every((row) => row.count === 1));
  assert.ok(metrics.some((row) => row.event === "result_shown"));
  assert.equal((await f.req(a, "DELETE")).status, 204);
  assert.equal(existsSync(f.app.store.dir(a.id)), false);
  assert.equal((await f.req(a)).status, 404);
});
test("invalid metadata, mime, magic, size and per-address/global limits fail closed", async (t) => {
  const f = await fixture(t, { maxBytes: 1024, maxPending: 1 }, "hang");
  assert.equal(
    (
      await f.req(f.access(), "POST", "", tiny, {
        "X-MST-Job-Options": JSON.stringify({
          ...options,
          crop: { left: 90, top: 0, width: 30, height: 20 },
        }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.req(f.access(), "POST", "", tiny, {
        "Content-Type": "image/svg+xml",
      })
    ).status,
    415,
  );
  assert.equal(
    (await f.req(f.access(), "POST", "", Buffer.alloc(1025))).status,
    413,
  );
  const corrupt = f.access();
  assert.equal(
    (await f.req(corrupt, "POST", "", Buffer.from("not an image"))).status,
    422,
  );
  assert.equal(existsSync(f.app.store.dir(corrupt.id)), false);
  const a = f.access();
  assert.equal((await f.req(a, "POST", "", tiny)).status, 202);
  assert.equal((await f.req(f.access(), "POST", "", tiny)).status, 503);
  assert.equal((await f.req(a, "POST", "/cancel")).status, 200);
  assert.equal((await f.done(a)).state, "cancelled");
});
test("worker failure is explicit, prompt and recorded without parser text", async (t) => {
  const f = await fixture(t, {}, "error"),
    a = f.access(),
    start = Date.now();
  await f.req(a, "POST", "", tiny);
  const job = await f.done(a);
  assert.equal(job.state, "failed");
  assert.equal(job.errorCode, "model_unavailable");
  assert.ok(Date.now() - start < 3000);
  assert.doesNotMatch(job.message, /sharper|smaller/i);
  assert.equal((await f.req(a, "GET", "/result")).status, 409);
});
test("stuck process is killed, terminal timeout persists and the slot recovers", async (t) => {
  const f = await fixture(t, { jobTimeoutMs: 250 }, "hang"),
    a = f.access();
  await f.req(a, "POST", "", tiny);
  assert.equal((await f.done(a)).state, "timed_out");
  const b = f.access();
  await f.req(b, "POST", "", tiny);
  assert.equal((await f.done(b)).state, "timed_out");
});
test("expiry removes original/results and access, while anonymous counters remain", async (t) => {
  const f = await fixture(t, { retentionMs: 10000 }),
    a = f.access();
  await f.req(a, "POST", "", tiny);
  await f.done(a);
  f.app.sweep(Date.now() + f.config.retentionMs + 1);
  assert.equal(existsSync(f.app.store.dir(a.id)), false);
  assert.equal((await f.req(a)).status, 404);
  assert.equal(
    f.app.store.db.prepare("SELECT COUNT(*) n FROM jobs").get()!.n,
    0,
  );
  assert.ok(
    Number(f.app.store.db.prepare("SELECT COUNT(*) n FROM metrics").get()!.n) >
      0,
  );
});
test("rate limit and storage cap do not accept another file", async (t) => {
  const f = await fixture(t, { hourlyLimit: 1 }),
    a = f.access();
  await f.req(a, "POST", "", tiny);
  await f.done(a);
  assert.equal((await f.req(f.access(), "POST", "", tiny)).status, 429);
  const g = await fixture(t, { maxStoredBytes: tiny.length }),
    b = g.access();
  await g.req(b, "POST", "", tiny);
  await g.done(b);
  assert.equal((await g.req(g.access(), "POST", "", tiny)).status, 503);
});
test(
  "real PNG/PDF rendering and Paddle contract preserve originals and map five fixture rows",
  { timeout: 150000 },
  async (t) => {
    const paddle = await paddleDouble();
    t.after(() => paddle.close());
    const f = await fixture(t, {
      paddleUrl: paddle.url,
      paddleToken: paddle.token,
      workerPath: resolve("server-dist/worker.mjs"),
      jobTimeoutMs: 60000,
    });
    for (const [file, mime] of [
      ["public/samples/bracket-bom.png", "image/png"],
      ["public/samples/bracket-bom.pdf", "application/pdf"],
    ]) {
      const a = f.access(),
        body = readFileSync(file);
      assert.equal(
        (await f.req(a, "POST", "", body, { "Content-Type": mime })).status,
        202,
      );
      const start = Date.now();
      let job: JobSnapshot;
      do {
        job = (await (await f.req(a)).json()) as JobSnapshot;
        if (!["uploading", "queued", "processing"].includes(job.state)) break;
        await new Promise((r) => setTimeout(r, 200));
      } while (Date.now() - start < 65000);
      assert.equal(job.state, "succeeded", JSON.stringify(job));
      const result = (await (
        await f.req(a, "GET", "/result")
      ).json()) as JobResult;
      assert.equal(result.rows.length, 5);
      assert.deepEqual(
        result.rows.map((row) => [row.partNumber, row.quantity]),
        [
          ["BRK-100", "1"],
          ["PIN-020", "2"],
          ["SCR-M6", "4"],
          ["WSH-M6", "4"],
          ["NUT-M6", "4"],
        ],
      );
      assert.deepEqual(
        readFileSync(join(f.app.store.dir(a.id), "source")),
        body,
      );
    }
  },
);

test(
  "an unavailable Paddle adapter reports model_unavailable promptly",
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t, {
      workerPath: resolve("server-dist/worker.mjs"),
      paddleUrl: "http://127.0.0.1:1",
    });
    const a = f.access(),
      started = Date.now();
    await f.req(a, "POST", "", readFileSync("public/samples/bracket-bom.png"));
    const job = await f.done(a);
    assert.equal(job.state, "failed");
    assert.equal(job.errorCode, "model_unavailable");
    assert.ok(Date.now() - started < 5000);
  },
);

test("uncompleted durable records become an explicit restart failure", async (t) => {
  const f = await fixture(t),
    a = f.access();
  f.app.store.create(
    a.id,
    a.token,
    "127.0.0.1",
    tiny.length,
    "image/png",
    options as import("../src/job-types").JobOptions,
  );
  f.app.store.update(a.id, "processing", "recognizing", 0.5);
  await f.app.close();
  const restored = createJobService(f.config);
  assert.equal(restored.store.get(a.id)!.state, "failed");
  assert.equal(restored.store.get(a.id)!.error, "interrupted");
  await restored.close();
});

test("retained uploads preserve private visitor/file/result records and deletion removes those records", async (t) => {
  const f = await fixture(t, { retentionMs: 0 }),
    a = f.access();
  const context = {
    visitorId: randomUUID(),
    filename: "../图纸.png",
    contactEmail: "fixture@example.invalid",
    referrerHost: "mst-us.ai",
  };
  await f.req(a, "POST", "", tiny, {
    "X-MST-Upload-Context": encodeURIComponent(JSON.stringify(context)),
  });
  await f.done(a);
  f.app.sweep(Date.now() + 365 * 86400_000);
  const stored = f.app.store.db
    .prepare("SELECT * FROM upload_context WHERE job_id=?")
    .get(a.id)!;
  assert.equal(stored.filename, "图纸.png");
  assert.equal(stored.visitor_id, context.visitorId);
  assert.equal(stored.contact_email, context.contactEmail);
  assert.equal(stored.sha256, createHash("sha256").update(tiny).digest("hex"));
  assert.equal(stored.result_rows, 1);
  assert.match(String(stored.network_id), /^[a-f0-9]{64}$/);
  const snapshot = await (await f.req(a)).text();
  assert.doesNotMatch(snapshot, /filename|contact_email|fixture@example/);
  assert.equal(f.app.store.get(a.id)!.expires, 0);
  const cleanup = execFileSync(
    process.execPath,
    [resolve("server-dist/cleanup.mjs")],
    {
      env: { ...process.env, MST_JOBS_DATA: f.config.dataDir },
      encoding: "utf8",
    },
  );
  assert.equal(JSON.parse(cleanup).removed, 0);
  assert.ok(existsSync(join(f.app.store.dir(a.id), "source")));
  await f.req(a, "DELETE");
  assert.equal(
    f.app.store.db.prepare("SELECT COUNT(*) n FROM upload_context").get()!.n,
    0,
  );
  assert.equal(existsSync(f.app.store.dir(a.id)), false);
});

test("gateway authentication precedes forwarded identity and still requires the job capability", async (t) => {
  const token = "test-gateway-".repeat(4);
  const f = await fixture(t, {
    trustProxy: true,
    gatewayToken: token,
    gatewayAddress: "127.0.0.1",
  });
  const a = f.access(),
    headers = { "X-MST-Gateway-Token": token, "X-Real-IP": "203.0.113.7" };
  assert.equal((await f.req(a, "POST", "", tiny)).status, 403);
  assert.equal(
    (
      await f.req(a, "POST", "", tiny, {
        ...headers,
        "X-MST-Gateway-Token": "bad",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.req(a, "POST", "", tiny, {
        ...headers,
        "X-Real-IP": "203.0.113.7, 127.0.0.1",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.req(a, "POST", "", tiny, {
        ...headers,
        Origin: "https://mst-us.ai",
      })
    ).status,
    403,
  );
  assert.equal((await f.req(a, "POST", "", tiny, headers)).status, 202);
  assert.equal(
    (
      await f.req(
        { ...a, token: f.access().token },
        "GET",
        "",
        undefined,
        headers,
      )
    ).status,
    404,
  );
  assert.equal((await f.req(a, "GET", "", undefined, headers)).status, 200);
  const g = await fixture(t, {
    trustProxy: true,
    gatewayToken: token,
    gatewayAddress: "203.0.113.99",
  });
  assert.equal(
    (await g.req(g.access(), "POST", "", tiny, headers)).status,
    403,
  );
});

test("bad private metadata and low disk space refuse admission without creating a file", async (t) => {
  const f = await fixture(t),
    a = f.access();
  assert.equal(
    (await f.req(a, "POST", "", tiny, { "X-MST-Upload-Context": "%not-json" }))
      .status,
    400,
  );
  const g = await fixture(t, { minFreeBytes: Number.MAX_SAFE_INTEGER });
  assert.equal((await g.req(g.access(), "POST", "", tiny)).status, 503);
  assert.equal(g.app.store.all().length, 0);
});

test("private metadata initialization failure releases pending capacity", async (t) => {
  const f = await fixture(t, { perAddressPending: 1 });
  const original = f.app.store.context;
  f.app.store.context = () => {
    throw new Error("injected database write failure");
  };
  const a = f.access();
  assert.equal((await f.req(a, "POST", "", tiny)).status, 422);
  assert.equal(f.app.store.get(a.id)?.state, "failed");
  assert.equal(existsSync(f.app.store.dir(a.id)), false);
  f.app.store.context = original;
  assert.equal((await f.req(f.access(), "POST", "", tiny)).status, 202);
});

test("cancelling a slow inference does not fail the next accepted job while Paddle is busy", async (t) => {
  const paddle = await paddleDouble(2500);
  t.after(() => paddle.close());
  const f = await fixture(t, {
    workerPath: resolve("server-dist/worker.mjs"),
    paddleUrl: paddle.url,
    paddleToken: paddle.token,
    jobTimeoutMs: 8000,
  });
  const first = f.access(),
    second = f.access();
  const body = readFileSync("public/samples/bracket-bom.png");
  await f.req(first, "POST", "", body);
  await new Promise((r) => setTimeout(r, 500));
  await f.req(first, "POST", "/cancel");
  assert.equal((await f.req(second, "POST", "", body)).status, 202);
  assert.equal((await f.done(first)).state, "cancelled");
  assert.equal((await f.done(second)).state, "succeeded");
});
