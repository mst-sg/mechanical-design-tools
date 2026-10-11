import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { paddleResult, recognizePaddle } from "../server/paddle";
const valid = {
  engine: {
    name: "PaddleOCR",
    version: "3.7.0",
    model: "PP-OCRv6",
    device: "gpu:0",
  },
  words: [{ text: "Qty", x: 10, y: 20, width: 30, height: 16, confidence: 99 }],
};
test("Paddle contract preserves words/provenance and refuses CPU or malformed results", () => {
  assert.deepEqual(paddleResult(valid).words, valid.words);
  assert.equal(paddleResult(valid).text, "Qty");
  for (const input of [
    { ...valid, engine: { ...valid.engine, device: "cpu" } },
    { ...valid, engine: { ...valid.engine, name: "Other engine" } },
    { ...valid, words: [{ ...valid.words[0], confidence: 101 }] },
    { ...valid, words: [{ ...valid.words[0], x: -1 }] },
    { ...valid, words: [{ ...valid.words[0], text: "x".repeat(2001) }] },
    { ...valid, words: Array(10001).fill(valid.words[0]) },
  ])
    assert.throws(() => paddleResult(input));
});
test("private Paddle transport sends only image bytes and bearer token, refuses redirects and oversized output", async (t) => {
  let mode = "ok",
    calls = 0;
  const server = createServer(async (request, response) => {
    calls++;
    assert.equal(request.url, "/ocr");
    assert.equal(request.headers.authorization, "Bearer test-only-token");
    const bytes = [];
    for await (const chunk of request) bytes.push(chunk);
    assert.equal(Buffer.concat(bytes).toString(), "synthetic-image-bytes");
    if (mode === "redirect") {
      response.writeHead(302, { Location: "/another-endpoint" });
      response.end();
      return;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(
      mode === "large"
        ? "x".repeat(2 * 1024 * 1024 + 1)
        : JSON.stringify(valid),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  );
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const infer = () =>
    recognizePaddle(
      Buffer.from("synthetic-image-bytes"),
      base,
      "test-only-token",
    );
  assert.equal((await infer()).engine.device, "gpu:0");
  mode = "redirect";
  await assert.rejects(infer);
  assert.equal(calls, 2);
  mode = "large";
  await assert.rejects(infer);
});
