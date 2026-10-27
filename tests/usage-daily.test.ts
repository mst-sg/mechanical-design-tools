import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createJobService } from "../server/app";
import { configuration } from "../server/config";
import {
  fileExtension,
  net24Hash,
  sizeBucket,
} from "../server/usage-daily";

const sha = (v: Buffer) => createHash("sha256").update(v).digest("hex");
type Row = Record<string, string | number>;

async function setup(t: test.TestContext, internalNets: string[] = []) {
  const directory = mkdtempSync(join(tmpdir(), "mst-usage-"));
  const config = configuration({
    dataDir: directory,
    origin: "https://tools.mst-us.ai",
    trustProxy: true,
    gatewayToken: "fixture-hop",
    gatewayAddress: "127.0.0.1",
    operatorToken: "fixture-operator",
    minFreeBytes: 0,
    internalNets,
  });
  const service = createJobService(config);
  await new Promise<void>((r) => service.server.listen(0, "127.0.0.1", r));
  const address = service.server.address();
  assert.ok(address && typeof address !== "string");
  t.after(async () => {
    await service.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${address.port}`;
  const headers = {
    "Content-Type": "application/json",
    Origin: config.origin,
    "X-MST-Gateway-Token": config.gatewayToken,
    "X-Real-IP": "203.0.113.8",
    "X-MST-Edge-Peer": "173.245.48.1",
    "X-MST-Edge-Country": "JP",
  };
  const rows = () =>
    service.store.db
      .prepare("SELECT * FROM usage_daily ORDER BY tool,action")
      .all() as Row[];
  return { service, base, headers, config, rows };
}

test("buckets, extensions and network hashes keep only coarse values", () => {
  assert.equal(sizeBucket(5), "<10KB");
  assert.equal(sizeBucket(50_000), "10-100KB");
  assert.equal(sizeBucket(500_000), "100KB-1MB");
  assert.equal(sizeBucket(5_000_000), "1-10MB");
  assert.equal(sizeBucket(20_000_000), ">10MB");
  assert.equal(sizeBucket(undefined), "unknown");
  assert.equal(fileExtension("Drawing.PDF"), "pdf");
  assert.equal(fileExtension("a.custom"), "other");
  assert.equal(fileExtension("noext"), "none");
  const key = randomBytes(32);
  assert.equal(net24Hash(key, "203.0.113.8"), net24Hash(key, "203.0.113.200"));
  assert.notEqual(net24Hash(key, "203.0.113.8"), net24Hash(key, "203.0.114.8"));
  assert.equal(
    net24Hash(key, "2001:db8:1::1"),
    net24Hash(key, "2001:db8:1:ffff::9"),
  );
  assert.match(net24Hash(key, "203.0.113.8"), /^[a-f0-9]{16}$/);
});

test("browser beacon counts select_file and export once, drops privacy opt-outs and rejects extra fields", async (t) => {
  const f = await setup(t, ["203.0.113.0/24"]);
  const body = {
    v: 1,
    eventId: randomUUID(),
    tool: "bom-compare",
    action: "select_file",
    ext: "csv",
    size: "<10KB",
    traffic: "browser",
  };
  const send = (value: unknown, extra = {}) =>
    fetch(`${f.base}/tools-api/v1/usage`, {
      method: "POST",
      headers: { ...f.headers, ...extra },
      body: JSON.stringify(value),
    });
  for (let i = 0; i < 2; i++) assert.equal((await send(body)).status, 204);
  assert.equal(f.rows().length, 1);
  assert.equal(f.rows()[0].count, 1);
  assert.equal(f.rows()[0].country, "JP");
  assert.equal(f.rows()[0].ext, "csv");
  assert.equal(f.rows()[0].email, "unknown");
  assert.equal(f.rows()[0].internal, 1, "configured internal /24");
  assert.equal(
    (await send({ ...body, eventId: randomUUID() }, { "Sec-GPC": "1" })).status,
    204,
  );
  assert.equal(
    (
      await send(
        { ...body, eventId: randomUUID(), action: "export" },
        { "X-Real-IP": "198.51.100.4" },
      )
    ).status,
    204,
  );
  assert.equal(f.rows().length, 2);
  assert.equal(f.rows().filter((r) => r.internal === 0).length, 1);
  // Drawing to BOM exports come from the job lifecycle, never the browser.
  await send({
    ...body,
    eventId: randomUUID(),
    tool: "drawing-to-bom",
    action: "export",
  });
  assert.equal(f.rows().length, 2);
  for (const bad of [
    { ...body, eventId: randomUUID(), filename: "secret.csv" },
    { ...body, eventId: randomUUID(), action: "start" },
    { ...body, eventId: randomUUID(), ext: "john" },
    { ...body, eventId: randomUUID(), tool: "other" },
  ])
    assert.equal((await send(bad)).status, 400);
  assert.equal(
    (
      await send(
        { ...body, eventId: randomUUID(), traffic: "test" },
        { "X-Real-IP": "198.51.100.9" },
      )
    ).status,
    204,
  );
  assert.ok(f.rows().some((r) => r.internal === 1 && r.action === "select_file"));
  assert.doesNotMatch(
    JSON.stringify(f.rows()),
    /203\.0\.113|198\.51\.100|secret|john/,
  );
});

test("job lifecycle records start, success, fail and export; operator exposes aggregates only", async (t) => {
  const f = await setup(t);
  const store = f.service.store;
  const origin = {
    tool: "drawing-to-bom",
    country: "SG",
    net24: net24Hash(store.key, "203.0.113.8"),
    ext: "pdf",
    size: "100KB-1MB",
    email: "yes" as const,
    internal: 0 as const,
  };
  for (const [name, finalState] of [
    ["a", "succeeded"],
    ["b", "failed"],
  ] as const) {
    const id = randomUUID();
    assert.equal(
      store.create(
        id,
        randomBytes(32).toString("hex"),
        "203.0.113.8",
        10,
        "application/pdf",
        { mode: "provided", traffic: "browser" } as never,
      ),
      null,
      name,
    );
    store.usageOriginSet(id, origin);
    store.usageBump(origin, "start");
    store.finish(id, finalState, finalState === "failed" ? "recognition_failed" : null);
    store.finish(id, finalState); // idempotent
    if (finalState === "succeeded") store.event(id, "exported");
    store.event(id, "exported");
  }
  const got = new Map(f.rows().map((r) => [r.action, r.count]));
  assert.equal(got.get("start"), 2);
  assert.equal(got.get("success"), 1);
  assert.equal(got.get("fail"), 1);
  assert.equal(got.get("export"), 2);
  const day = String(f.rows()[0].day);
  const response = await fetch(
    `${f.base}/tools-operator/v1/usage-daily?start=${day}&end=${day}`,
    {
      headers: {
        "X-MST-Operator-Token": "fixture-operator",
        "X-MST-Gateway-Token": "fixture-hop",
        "X-Real-IP": "127.0.0.1",
      },
    },
  );
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.rows.length, f.rows().length);
  assert.deepEqual(
    Object.keys(json.rows[0]).sort(),
    "action,count,country,day,email,ext,internal,net24,size,tool".split(","),
  );
  assert.equal(
    (
      await fetch(`${f.base}/tools-operator/v1/usage-daily?start=x&end=y`, {
        headers: { "X-MST-Operator-Token": "fixture-operator", "X-MST-Gateway-Token": "fixture-hop" },
      })
    ).status,
    400,
  );
  assert.doesNotMatch(JSON.stringify(json), /203\.0\.113/);
});

test("submission lifecycle records start then browser-reported success or fail", async (t) => {
  const f = await setup(t);
  const run = async (status: string) => {
    const id = randomUUID(),
      token = randomBytes(32).toString("hex"),
      data = Buffer.from("part,qty\nA,2\n");
    const manifest = {
      v: 1,
      tool: "bom-compare",
      mode: "provided",
      traffic: "browser",
      visitorId: randomUUID(),
      contactEmail: "",
      source: "direct",
      inputs: { text: "x" },
      result: { status },
      files: [
        {
          role: "after",
          name: "My Private Name.csv",
          relativePath: "",
          size: data.length,
          sha256: sha(data),
        },
      ],
    };
    const headers = { ...f.headers, Authorization: `Bearer ${token}` };
    const url = `${f.base}/tools-api/v1/submissions/${id}`;
    assert.equal(
      (await fetch(url, { method: "POST", headers, body: JSON.stringify(manifest) })).status,
      201,
    );
    assert.equal(
      (
        await fetch(url + "/files/0", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/octet-stream" },
          body: data as unknown as BodyInit,
        })
      ).status,
      200,
    );
    assert.equal((await fetch(url + "/finish", { method: "POST", headers })).status, 200);
    assert.equal((await fetch(url + "/finish", { method: "POST", headers })).status, 200);
  };
  await run("succeeded");
  await run("failed");
  const got = new Map(f.rows().map((r) => [r.action, r]));
  assert.equal(got.get("start")!.count, 2);
  assert.equal(got.get("success")!.count, 1);
  assert.equal(got.get("fail")!.count, 1);
  assert.equal(got.get("start")!.ext, "csv");
  assert.equal(got.get("start")!.size, "<10KB");
  assert.equal(got.get("start")!.email, "no");
  assert.equal(got.get("start")!.internal, 0);
  assert.doesNotMatch(JSON.stringify(f.rows()), /Private|203\.0\.113/);
});
