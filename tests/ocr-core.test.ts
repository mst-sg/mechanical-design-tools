import { test } from "node:test";
import assert from "node:assert/strict";
import { downloadCore } from "../src/ocr-core";

test("stalled core headers are aborted and retried once", async (t) => {
  let attempts = 0,
    retries = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, options: RequestInit) => {
      attempts++;
      if (attempts === 1)
        return new Promise<Response>((_resolve, reject) => {
          options.signal!.addEventListener(
            "abort",
            () => reject(options.signal!.reason),
            { once: true },
          );
        });
      return new Response("engine");
    },
  );
  await downloadCore(
    "/core.js",
    new AbortController().signal,
    () => retries++,
    20,
  );
  assert.equal(attempts, 2);
  assert.equal(retries, 1);
});

test("stalled response bodies are cancelled and attempts stay bounded", async (t) => {
  let attempts = 0,
    cancelled = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, options: RequestInit) => {
      attempts++;
      return new Response(
        new ReadableStream({
          start(controller) {
            options.signal!.addEventListener(
              "abort",
              () => {
                cancelled++;
                controller.error(options.signal!.reason);
              },
              { once: true },
            );
          },
        }),
      );
    },
  );
  await assert.rejects(
    downloadCore("/core.js", new AbortController().signal, () => {}, 20),
    /could not finish downloading/,
  );
  assert.equal(attempts, 2);
  assert.equal(cancelled, 2);
});

test("user cancellation stops preloading without retry", async (t) => {
  const control = new AbortController();
  let attempts = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, options: RequestInit) => {
      attempts++;
      return new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener(
          "abort",
          () => reject(options.signal!.reason),
          { once: true },
        );
        control.abort(new DOMException("Cancelled", "AbortError"));
      });
    },
  );
  await assert.rejects(
    downloadCore(
      "/core.js",
      control.signal,
      () => assert.fail("Cancellation must not retry"),
      20,
    ),
    { name: "AbortError" },
  );
  assert.equal(attempts, 1);
});

test("missing core does not retry an unavailable release asset", async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => {
    attempts++;
    return new Response("missing", { status: 404 });
  });
  await assert.rejects(
    downloadCore(
      "/core.js",
      new AbortController().signal,
      () => assert.fail("404 must not retry"),
      20,
    ),
    /component is unavailable/,
  );
  assert.equal(attempts, 1);
});
