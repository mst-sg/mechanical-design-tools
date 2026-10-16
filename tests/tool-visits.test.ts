import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createJobService } from "../server/app";
import { configuration } from "../server/config";
test("isolated tool page context is bounded, deduplicated, distinguishes test, honors privacy and never stores inputs", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "mst-visit-"));
  const config = configuration({
    dataDir: directory,
    origin: "https://tools.mst-us.ai",
    trustProxy: true,
    gatewayToken: "fixture-hop",
    gatewayAddress: "127.0.0.1",
  });
  const service = createJobService(config);
  await new Promise<void>((r) => service.server.listen(0, "127.0.0.1", r));
  const address = service.server.address();
  assert.ok(address && typeof address !== "string");
  t.after(async () => {
    await service.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const headers = {
    "Content-Type": "application/json",
    Origin: config.origin,
    "X-MST-Gateway-Token": config.gatewayToken,
    "X-Real-IP": "203.0.113.8",
    "X-MST-Edge-Peer": "173.245.48.1",
    "X-MST-Edge-Country": "JP",
    "Accept-Language": "en;q=0,ja-JP;q=0.8",
  };
  const body = {
    v: 1,
    eventId: randomUUID(),
    tool: "bom-compare",
    source: "google",
    traffic: "browser",
  };
  const send = (value = body, extra = {}) =>
    fetch(`http://127.0.0.1:${address.port}/tools-api/v1/visits`, {
      method: "POST",
      headers: { ...headers, ...extra },
      body: JSON.stringify(value),
    });
  for (let i = 0; i < 2; i++) assert.equal((await send()).status, 204);
  const rows = () =>
    service.store.db.prepare("SELECT * FROM visitor_counters").all();
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].count, 1);
  assert.equal(rows()[0].country, "JP");
  assert.equal(rows()[0].language, "ja-JP");
  assert.equal(
    (await send({ ...body, eventId: randomUUID() }, { "Sec-GPC": "1" })).status,
    204,
  );
  assert.equal(rows()[0].count, 1);
  assert.equal(
    (await send({ ...body, eventId: randomUUID(), traffic: "test" })).status,
    204,
  );
  assert.equal(rows().length, 2);
  assert.equal(
    (
      await send({
        ...body,
        eventId: randomUUID(),
        inputs: "PRIVATE",
      } as typeof body)
    ).status,
    400,
  );
  assert.equal((await send(body, { Origin: "https://mst-us.ai" })).status, 403);
  assert.doesNotMatch(JSON.stringify(rows()), /203\.0\.113|PRIVATE|Bearer/);
});
