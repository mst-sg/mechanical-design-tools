import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { request } from "node:http";
import { createJobService } from "../server/app";
import { configuration, type Config } from "../server/config";
import { parseManifest } from "../server/submissions";
import { preferredLanguage } from "../server/visitor-context";
import type { SubmissionManifest } from "../src/submission-types";
const sha = (v: Buffer | string) =>
  createHash("sha256").update(v).digest("hex");
const access = () => ({
  id: randomUUID(),
  token: randomBytes(32).toString("hex"),
});
async function waitFor(check: () => boolean) {
  for (let n = 0; n < 100; n++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail("Synthetic upload did not reach the expected stage.");
}
function slowUpload(
  f: Awaited<ReturnType<typeof fixture>>,
  a: ReturnType<typeof access>,
  bytes: number,
) {
  const address = f.app.server.address();
  assert.ok(address && typeof address !== "string");
  let resolve!: (value: { status: number; body: string }) => void;
  const response = new Promise<{ status: number; body: string }>((r) => {
    resolve = r;
  });
  const req = request(
    `http://127.0.0.1:${address.port}/tools-api/v1/submissions/${a.id}/files/0`,
    {
      method: "POST",
      headers: {
        Origin: f.config.origin,
        Authorization: `Bearer ${a.token}`,
        "Content-Type": "application/octet-stream",
        "Content-Length": bytes,
      },
    },
    (res) => {
      const parts: Buffer[] = [];
      res.on("data", (chunk) => parts.push(chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode || 0,
          body: Buffer.concat(parts).toString(),
        }),
      );
      res.on("error", (error) => resolve({ status: 0, body: error.message }));
    },
  );
  req.on("error", (error) => resolve({ status: 0, body: error.message }));
  req.setTimeout(5000, () =>
    req.destroy(new Error("Synthetic upload timed out.")),
  );
  return { req, response };
}
function manifest(data = Buffer.from("part,qty\nA,2\n")): SubmissionManifest {
  return {
    v: 1,
    tool: "bom-compare",
    mode: "provided",
    traffic: "test",
    visitorId: randomUUID(),
    contactEmail: "fixture@example.invalid",
    source: "ai",
    inputs: {
      before: "part,qty\nA,1\n",
      after: data.toString(),
      map: { part: 0, quantity: 1 },
    },
    result: {
      status: "succeeded",
      value: [{ part: "A", before: 1, after: 2 }],
    },
    files: [
      {
        role: "after",
        name: "revision-b.csv",
        relativePath: "",
        size: data.length,
        sha256: sha(data),
      },
    ],
  };
}
async function fixture(t: test.TestContext, overrides: Partial<Config> = {}) {
  const root = mkdtempSync(join(tmpdir(), "mst-submission-test-"));
  const config = configuration({
    dataDir: join(root, "data"),
    minFreeBytes: 0,
    hourlyLimit: 100,
    perAddressPending: 20,
    ...overrides,
  });
  let app = createJobService(config),
    base = "";
  const listen = async () => {
    await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
    const address = app.server.address();
    assert.ok(address && typeof address !== "string");
    base = `http://127.0.0.1:${address.port}`;
  };
  await listen();
  const req = (
    a: ReturnType<typeof access>,
    method = "GET",
    suffix = "",
    body?: unknown,
    extra: Record<string, string> = {},
  ) =>
    fetch(`${base}/tools-api/v1/submissions/${a.id}${suffix}`, {
      method,
      headers: {
        Origin: config.origin,
        Authorization: `Bearer ${a.token}`,
        ...(body !== undefined
          ? {
              "Content-Type":
                body instanceof Buffer
                  ? "application/octet-stream"
                  : "application/json",
            }
          : {}),
        ...extra,
      },
      body:
        body instanceof Buffer
          ? (body as unknown as BodyInit)
          : body === undefined
            ? undefined
            : JSON.stringify(body),
    });
  const operator = (path: string, headers: Record<string, string> = {}) =>
    fetch(base + "/tools-operator/v1/" + path, { headers });
  const restart = async () => {
    await app.close();
    app = createJobService(config);
    await listen();
  };
  t.after(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    get app() {
      return app;
    },
    req,
    operator,
    restart,
    config,
    root,
  };
}
test("original bytes, inputs, results, roles and context survive restart; capability and origin stay isolated", async (t) => {
  const f = await fixture(t),
    a = access(),
    data = Buffer.from("part,qty\nA,2\n"),
    m = manifest(data);
  assert.equal(
    (
      await f.req(a, "POST", "", m, {
        "Accept-Language": "zh-CN;q=0.4,ja-JP;q=0.9",
        "X-MST-Edge-Peer": "173.245.48.1",
        "X-MST-Edge-Country": "US",
      })
    ).status,
    201,
  );
  assert.equal((await f.req(a, "POST", "/finish")).status, 409);
  assert.equal((await f.req(a, "POST", "/files/0", data)).status, 200);
  assert.equal((await f.req(a, "POST", "/finish")).status, 200);
  const original = join(f.config.dataDir, "submissions", a.id, "0");
  assert.deepEqual(readFileSync(original), data);
  assert.equal(statSync(original).mode & 0o777, 0o600);
  assert.equal(
    statSync(join(f.config.dataDir, "submissions", a.id)).mode & 0o777,
    0o700,
  );
  for (const [method, suffix] of [
    ["GET", ""],
    ["GET", "/record"],
    ["GET", "/files/0"],
    ["POST", "/finish"],
    ["DELETE", ""],
  ])
    assert.equal(
      (await f.req({ ...a, token: access().token }, method, suffix)).status,
      404,
    );
  assert.equal(
    (
      await f.req(a, "GET", "/record", undefined, {
        Origin: "https://mst-us.ai",
      })
    ).status,
    403,
  );
  await f.restart();
  const r = await (await f.req(a, "GET", "/record")).json();
  assert.deepEqual(r.submission, m);
  assert.equal(r.state, "completed");
  assert.equal(r.context.country, "");
  assert.equal(r.context.browser_language, "ja-JP");
  assert.equal(r.context.result_source, "browser_reported");
  const download = await f.req(a, "GET", "/files/0");
  assert.match(download.headers.get("content-disposition")!, /^attachment;/);
  assert.match(download.headers.get("cache-control")!, /no-store/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), data);
  assert.equal((await f.req(a, "DELETE")).status, 204);
  assert.ok(!existsSync(original));
  assert.equal((await f.req(a, "GET", "/record")).status, 404);
});
test("same-manifest retries and finish are idempotent; changed manifests and wrong file hashes are rejected", async (t) => {
  const f = await fixture(t),
    a = access(),
    data = Buffer.from("abcd"),
    m = manifest(data);
  assert.equal((await f.req(a, "POST", "", m)).status, 201);
  const reserved = f.app.store.storedBytes();
  assert.equal((await f.req(a, "POST", "", m)).status, 200);
  assert.equal(f.app.store.storedBytes(), reserved);
  assert.equal(
    (await f.req(a, "POST", "", { ...m, inputs: { different: true } })).status,
    409,
  );
  assert.equal(
    (await f.req(a, "POST", "/files/0", Buffer.from("bad!"))).status,
    400,
  );
  assert.equal((await f.req(a, "GET", "/files/0")).status, 404);
  assert.equal((await f.req(a, "POST", "/files/0", data)).status, 200);
  assert.equal((await f.req(a, "POST", "/files/0", data)).status, 200);
  for (let i = 0; i < 3; i++)
    assert.equal((await f.req(a, "POST", "/finish")).status, 200);
  assert.equal(
    f.app.store.db.prepare("SELECT COUNT(*) n FROM submissions").get()!.n,
    1,
  );
});
test("expiry releases only missing file reservations and preserves received originals and failed analysis", async (t) => {
  const f = await fixture(t),
    a = access(),
    data = Buffer.from("data"),
    m = manifest(data);
  m.result = { status: "failed", error: "Invalid CSV" };
  m.files.push({
    ...m.files[0],
    name: "other.csv",
    role: "before",
    size: 1000,
    sha256: sha(Buffer.alloc(1000)),
  });
  assert.equal((await f.req(a, "POST", "", m)).status, 201);
  assert.equal((await f.req(a, "POST", "/files/0", data)).status, 200);
  const before = f.app.store.storedBytes();
  f.app.sweep(Date.now() + 86400_001);
  assert.equal(f.app.store.storedBytes(), before - 1000);
  assert.equal(
    (await f.req(a, "POST", "/files/1", Buffer.alloc(1000))).status,
    409,
  );
  assert.deepEqual(
    Buffer.from(await (await f.req(a, "GET", "/files/0")).arrayBuffer()),
    data,
  );
  const r = await (await f.req(a, "GET", "/record")).json();
  assert.equal(r.state, "interrupted");
  assert.equal(r.submission.result.status, "failed");
});
test("combined storage and rate limits include text-only records and OCR reservations", async (t) => {
  const f = await fixture(t, { hourlyLimit: 1 }),
    a = access(),
    m = manifest();
  m.files = [];
  assert.equal((await f.req(a, "POST", "", m)).status, 201);
  assert.equal((await f.req(a, "POST", "/finish")).status, 200);
  assert.ok(f.app.store.storedBytes() > Buffer.byteLength(JSON.stringify(m)));
  assert.equal((await f.req(access(), "POST", "", m)).status, 429);
  const g = await fixture(t),
    b = access();
  assert.equal((await g.req(b, "POST", "", m)).status, 201);
  assert.equal((await g.req(b, "POST", "/finish")).status, 200);
  g.config.maxStoredBytes = g.app.store.storedBytes() + 1;
  assert.equal((await g.req(access(), "POST", "", m)).status, 503);
  assert.equal(
    g.app.store.reserveCheck(g.app.store.address("127.0.0.1", Date.now()), 100),
    "busy",
  );
});
test("manifest limits, relative paths and roles are checked without touching file content", () => {
  for (const mutate of [
    (m: SubmissionManifest) => {
      m.files = Array(33).fill(m.files[0]);
    },
    (m: SubmissionManifest) => {
      m.files[0].size = 25 * 1024 * 1024 + 1;
    },
    (m: SubmissionManifest) => {
      m.files[0].name = "../x.csv";
    },
    (m: SubmissionManifest) => {
      m.files[0].relativePath = "a/../b";
    },
    (m: SubmissionManifest) => {
      m.files[0].role = "";
    },
    (m: SubmissionManifest) => {
      m.files[0].sha256 = "x";
    },
  ]) {
    const m = manifest();
    mutate(m);
    assert.throws(() => parseManifest(m));
  }
  const empty = manifest();
  empty.files[0].size = 0;
  empty.files[0].sha256 = sha("");
  assert.doesNotThrow(() => parseManifest(empty));
});
test("operator role is separate from gateway and visitor credentials; country requires both trusted hops", async (t) => {
  const gateway = "synthetic-gateway",
    operator = "synthetic-operator-read",
    f = await fixture(t, {
      gatewayToken: gateway,
      operatorToken: operator,
      gatewayAddress: "127.0.0.1",
      trustProxy: true,
    }),
    a = access(),
    m = manifest();
  m.files = [];
  const hop = {
    "X-MST-Gateway-Token": gateway,
    "X-Real-IP": "203.0.113.5",
    "X-MST-Edge-Peer": "2606:4700::1",
    "X-MST-Edge-Country": "SG",
  };
  assert.equal((await f.req(a, "POST", "", m)).status, 403);
  assert.equal((await f.req(a, "POST", "", m, hop)).status, 201);
  await f.req(a, "POST", "/finish", undefined, hop);
  for (const token of ["", a.token, gateway])
    assert.equal(
      (await f.operator("records", { ...hop, "X-MST-Operator-Token": token }))
        .status,
      403,
    );
  const headers = { ...hop, "X-MST-Operator-Token": operator };
  assert.equal(
    (await f.operator("records", { ...headers, Origin: f.config.origin }))
      .status,
    403,
  );
  assert.equal(
    (await (await f.operator("records", headers)).json()).records.length,
    0,
  );
  const list = await (await f.operator("records?show_tests=1", headers)).json();
  assert.equal(list.records.length, 1);
  assert.equal(list.records[0].context.country, "SG");
  assert.equal(list.records[0].context.country_source, "cloudflare");
  const detail = await (await f.operator(`submission/${a.id}`, headers)).json();
  assert.deepEqual(detail.submission.inputs, m.inputs);
  assert.equal(
    (await f.operator(`submission/${randomUUID()}`, headers)).status,
    404,
  );
});
test("preferred language honors q weights and rejects malformed or excluded values", () => {
  assert.equal(
    preferredLanguage("en;q=0,ZH-hant-tw;q=0.8,ja;q=0.5"),
    "zh-Hant-TW",
  );
  assert.equal(preferredLanguage("<script>,*;q=1,english,fr;q=9"), "");
});
test("an active slow upload keeps its full reservation across expiry and finishes intact", async (t) => {
  const f = await fixture(t),
    a = access(),
    data = Buffer.alloc(1024 * 1024, 65),
    m = manifest(data);
  m.inputs = {};
  assert.equal((await f.req(a, "POST", "", m)).status, 201);
  const reserved = f.app.store.storedBytes(),
    scratch = join(f.config.dataDir, "submissions", a.id, "0.part");
  const pending = slowUpload(f, a, data.length);
  t.after(() => pending.req.destroy());
  pending.req.write(data.subarray(0, 32));
  await waitFor(() => existsSync(scratch) && statSync(scratch).size === 32);
  f.app.sweep(Date.now() + 86400_100);
  const row = f.app.store.db
    .prepare("SELECT state,bytes FROM submissions WHERE id=?")
    .get(a.id)!;
  assert.equal(row.state, "uploading");
  assert.equal(row.bytes, reserved);
  assert.equal(f.app.store.storedBytes(), reserved);
  assert.equal((await f.req(a, "DELETE")).status, 409);
  pending.req.end(data.subarray(32));
  assert.equal((await pending.response).status, 200);
  assert.equal((await f.req(a, "POST", "/finish")).status, 200);
  assert.deepEqual(
    Buffer.from(await (await f.req(a, "GET", "/files/0")).arrayBuffer()),
    data,
  );
});
test("a renamed original recovers after its completion write fails, retaining its digest and charge", async (t) => {
  const gateway = "recovery-gateway",
    operator = "recovery-owner",
    f = await fixture(t, {
      gatewayToken: gateway,
      operatorToken: operator,
      gatewayAddress: "127.0.0.1",
      trustProxy: true,
    });
  const a = access(),
    data = Buffer.from("verified original bytes"),
    m = manifest(data),
    hop = { "X-MST-Gateway-Token": gateway, "X-Real-IP": "203.0.113.8" };
  assert.equal((await f.req(a, "POST", "", m, hop)).status, 201);
  const prepare = f.app.store.db.prepare.bind(f.app.store.db);
  f.app.store.db.prepare = (sql) => {
    if (sql.startsWith("UPDATE submission_files SET complete=1"))
      throw new Error("Synthetic failure after rename.");
    return prepare(sql);
  };
  try {
    assert.equal((await f.req(a, "POST", "/files/0", data, hop)).status, 503);
  } finally {
    f.app.store.db.prepare = prepare;
  }
  const original = join(f.config.dataDir, "submissions", a.id, "0");
  assert.deepEqual(readFileSync(original), data);
  assert.equal(
    f.app.store.db
      .prepare("SELECT complete FROM submission_files WHERE submission_id=?")
      .get(a.id)!.complete,
    0,
  );
  await f.restart();
  f.app.sweep(Date.now() + 86400_100);
  const row = f.app.store.db
    .prepare("SELECT state,bytes,metadata_bytes FROM submissions WHERE id=?")
    .get(a.id)!;
  assert.equal(row.state, "interrupted");
  assert.equal(row.bytes, Number(row.metadata_bytes) + data.length);
  assert.equal(
    f.app.store.db
      .prepare("SELECT complete FROM submission_files WHERE submission_id=?")
      .get(a.id)!.complete,
    1,
  );
  assert.deepEqual(
    Buffer.from(
      await (await f.req(a, "GET", "/files/0", undefined, hop)).arrayBuffer(),
    ),
    data,
  );
  const download = await f.operator(`submission/${a.id}/files/0`, {
    ...hop,
    "X-MST-Operator-Token": operator,
  });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("x-mst-file-sha256"), sha(data));
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), data);
});
test("mismatched recovered files stay retained and charged but cannot be downloaded by either role", async (t) => {
  for (const corrupt of [
    Buffer.from("wrong original content!"),
    Buffer.alloc(2048, 66),
  ]) {
    const gateway = "integrity-gateway",
      operator = "integrity-owner",
      f = await fixture(t, {
        gatewayToken: gateway,
        operatorToken: operator,
        gatewayAddress: "127.0.0.1",
        trustProxy: true,
      });
    const a = access(),
      data = Buffer.from("verified original bytes"),
      m = manifest(data),
      hop = { "X-MST-Gateway-Token": gateway, "X-Real-IP": "203.0.113.8" };
    assert.equal((await f.req(a, "POST", "", m, hop)).status, 201);
    const original = join(f.config.dataDir, "submissions", a.id, "0");
    writeFileSync(original, corrupt, { mode: 0o600, flag: "wx" });
    await f.restart();
    f.app.sweep(Date.now() + 86400_100);
    const row = f.app.store.db
      .prepare("SELECT state,bytes,metadata_bytes FROM submissions WHERE id=?")
      .get(a.id)!;
    assert.equal(row.state, "interrupted");
    assert.equal(row.bytes, Number(row.metadata_bytes) + corrupt.length);
    assert.equal(
      f.app.store.db
        .prepare("SELECT complete FROM submission_files WHERE submission_id=?")
        .get(a.id)!.complete,
      -1,
    );
    assert.equal(
      (await f.req(a, "GET", "/files/0", undefined, hop)).status,
      404,
    );
    assert.equal(
      (await f.req(a, "POST", "/finish", undefined, hop)).status,
      409,
    );
    const headers = { ...hop, "X-MST-Operator-Token": operator };
    assert.equal(
      (await f.operator(`submission/${a.id}/files/0`, headers)).status,
      404,
    );
    const detail = await (
      await f.operator(`submission/${a.id}`, headers)
    ).json();
    assert.equal(detail.files[0].complete, false);
    assert.equal(detail.files[0].integrityError, true);
    assert.deepEqual(readFileSync(original), corrupt);
    assert.equal(f.app.store.storedBytes(), row.bytes);
  }
});
test("physical admission subtracts outstanding file reservations before accepting another manifest", async (t) => {
  const floor = 2 * 1024 * 1024 * 1024,
    f = await fixture(t, { minFreeBytes: floor }),
    m = manifest();
  m.inputs = {};
  m.files[0].size = 25 * 1024 * 1024;
  f.app.store.freeBytes = () => floor + 40 * 1024 * 1024;
  assert.equal((await f.req(access(), "POST", "", m)).status, 201);
  assert.ok(f.app.store.outstandingBytes() >= m.files[0].size);
  assert.equal((await f.req(access(), "POST", "", m)).status, 503);
  assert.equal(
    f.app.store.db.prepare("SELECT COUNT(*) n FROM submissions").get()!.n,
    1,
  );
});
test("a streaming upload stops when external disk usage consumes the protected headroom", async (t) => {
  const floor = 1024 * 1024,
    f = await fixture(t, { minFreeBytes: floor }),
    a = access(),
    data = Buffer.alloc(256 * 1024, 65),
    m = manifest(data);
  m.inputs = {};
  let free = floor + 4 * 1024 * 1024;
  f.app.store.freeBytes = () => free;
  assert.equal((await f.req(a, "POST", "", m)).status, 201);
  const dir = join(f.config.dataDir, "submissions", a.id),
    pending = slowUpload(f, a, data.length);
  t.after(() => pending.req.destroy());
  pending.req.write(data.subarray(0, 32));
  await waitFor(
    () =>
      existsSync(join(dir, "0.part")) &&
      statSync(join(dir, "0.part")).size === 32,
  );
  free = floor - 1;
  pending.req.end(data.subarray(32));
  assert.notEqual((await pending.response).status, 200);
  await waitFor(() => !existsSync(join(dir, "0.part")));
  assert.equal(existsSync(join(dir, "0")), false);
  assert.equal((await f.req(a, "GET", "/files/0")).status, 404);
});
