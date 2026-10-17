import { test } from "node:test";
import assert from "node:assert/strict";
import entry from "../deploy/us-entry/worker";
import { createServer } from "node:http";

test("the two primary entries describe their task and link to a handbook without running the child", async () => {
  for (const [slug, heading, purpose, section] of [
    [
      "drawing-to-bom",
      "Drawing to BOM",
      /parts table.*PNG, JPEG or PDF.*review.*Excel or CSV/i,
      "drawing-bom",
    ],
    [
      "bom-check",
      "BOM CSV Checker",
      /BOM CSV.*duplicate part numbers.*missing quantities.*conflicting fields.*review.*export/i,
      "duplicates",
    ],
  ] as const) {
    for (const qa of [false, true]) {
      const response = await entry.fetch(
        new Request(
          `https://mst-us.ai/tools/${slug}/?token=PRIVATE_SENTINEL${qa ? "&mst_analytics_test=1" : ""}`,
        ),
      );
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.equal((html.match(/<h1>/g) || []).length, 1);
      assert.ok(html.includes(`<h1>${heading}</h1>`));
      const description = html.match(
        /<meta name="description" content="([^"]+)"/,
      )?.[1];
      assert.match(description || "", purpose);
      assert.ok(html.includes(`<p>${description}`));
      assert.ok(
        html.includes(
          `href="/tools/handbook/${qa ? "?mst_analytics_test=1" : ""}#${section}"`,
        ),
      );
      assert.ok(
        html.includes(
          `rel="canonical" href="https://mst-us.ai/tools/${slug}/"`,
        ),
      );
      assert.doesNotMatch(html, /PRIVATE_SENTINEL|<script|postMessage/);
    }
  }
});

test("US entry stays on root URL and hosts only the separate private tool origin", async () => {
  for (const path of ["", "/", "/index.html"]) {
    const response = await entry.fetch(
      new Request(
        "https://mst-us.ai/tools/drawing-to-bom" +
          path +
          "?mst_analytics_test=1&token=PRIVATE_TOKEN_SENTINEL&next=https://example.invalid",
      ),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Location"), null);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const html = await response.text();
    assert.match(
      html,
      /src="https:\/\/tools.mst-us.ai\/tools\/drawing-to-bom\/\?mst_analytics_test=1&amp;mst_source=direct"/,
    );
    assert.match(html, /allow-same-origin allow-downloads/);
    assert.doesNotMatch(
      html,
      /PRIVATE_TOKEN_SENTINEL|example.invalid|mst-sg|<script|postMessage|<input/i,
    );
    assert.match(
      response.headers.get("Content-Security-Policy")!,
      /frame-ancestors 'none'/,
    );
  }
});

test("US shell refuses file POSTs, other origins and paths with no fallback", async () => {
  assert.equal(
    (
      await entry.fetch(
        new Request("https://mst-us.ai/tools/drawing-to-bom/", {
          method: "POST",
          body: "private",
        }),
      )
    ).status,
    405,
  );
  assert.equal(
    (await entry.fetch(new Request("https://mst-sg.com/tools/drawing-to-bom/")))
      .status,
    404,
  );
  assert.equal(
    (
      await entry.fetch(
        new Request("https://mst-us.ai/tools/drawing-to-bom/unexpected"),
      )
    ).status,
    404,
  );
  const response = await entry.fetch(
    new Request("https://mst-us.ai/tools/drawing-to-bom/", { method: "HEAD" }),
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

test("all ten exact tools use the trusted child and only bounded attribution crosses the shell", async () => {
  const { tools } = await import("../src/catalog");
  for (const tool of tools) {
    const response = await entry.fetch(
      new Request(
        `https://mst-us.ai/tools/${tool.slug}/?utm_source=chatgpt&email=PRIVATE_EMAIL_SENTINEL&token=SECRET_TOKEN_SENTINEL`,
      ),
    );
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(
      body.includes(
        `https://tools.mst-us.ai/tools/${tool.slug}/?mst_source=ai`,
      ),
    );
    assert.doesNotMatch(
      body,
      /PRIVATE_EMAIL_SENTINEL|SECRET_TOKEN_SENTINEL|<script|postMessage/,
    );
    assert.equal(
      (
        await entry.fetch(
          new Request(`https://mst-us.ai/tools/${tool.slug}/files/private`),
        )
      ).status,
      404,
    );
  }
});

test("public handbook and offline artifacts use only the trusted fixed upstream without visitor credentials", async (t) => {
  const calls: {
    path: string;
    method: string;
    headers: Record<string, unknown>;
  }[] = [];
  const fixture = createServer((request, response) => {
    calls.push({
      path: request.url!,
      method: request.method!,
      headers: request.headers,
    });
    const zip = request.url!.endsWith(".zip"),
      sums = request.url!.endsWith("SHA256SUMS");
    response.writeHead(200, {
      "Content-Type": zip
        ? "application/zip"
        : sums
          ? "application/octet-stream"
          : "text/html",
      "Set-Cookie": "must-not-cross=1",
      "Cache-Control": "public",
    });
    response.end(
      zip
        ? Buffer.from([80, 75, 3, 4])
        : sums
          ? "owned-fixture-sha256  handbook.html\n"
          : "<!doctype html><h1>Owned handbook fixture</h1>",
    );
  });
  await new Promise<void>((done) => fixture.listen(0, "127.0.0.1", done));
  const address = fixture.address();
  assert.ok(address && typeof address !== "string");
  const realFetch = globalThis.fetch;
  const upstream = t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
      );
      assert.equal(url.origin, "https://tools.mst-us.ai");
      assert.equal(url.search, "");
      return realFetch(`http://127.0.0.1:${address.port}${url.pathname}`, init);
    },
  );
  try {
    for (const path of [
      "/tools/handbook",
      "/tools/handbook/",
      "/tools/handbook/index.html",
      "/tools/labs/drawing-bom/handbook.html",
      "/tools/labs/drawing-bom/drawing-bom-lab.zip",
      "/tools/labs/drawing-bom/SHA256SUMS",
    ]) {
      const response = await entry.fetch(
        new Request(
          `https://mst-us.ai${path}?token=PRIVATE_SENTINEL&mst_analytics_test=1`,
          {
            headers: {
              Authorization: "Bearer PRIVATE_SENTINEL",
              Cookie: "PRIVATE_SENTINEL=1",
              "X-MST-Operator-Token": "PRIVATE_SENTINEL",
            },
          },
        ),
      );
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(response.headers.get("Set-Cookie"), null);
      assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
      assert.match(
        response.headers.get("Content-Security-Policy")!,
        /default-src 'none'/,
      );
      assert.ok((await response.arrayBuffer()).byteLength > 0);
      const call = calls.at(-1)!;
      assert.equal(
        call.path,
        path === "/tools/handbook" ? "/tools/handbook/" : path,
      );
      assert.equal(call.method, "GET");
      assert.doesNotMatch(
        JSON.stringify(call),
        /PRIVATE_SENTINEL|authorization|cookie|operator/i,
      );
    }
    const head = await entry.fetch(
      new Request("https://mst-us.ai/tools/handbook/", { method: "HEAD" }),
    );
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    assert.equal(calls.at(-1)!.method, "HEAD");
    const previous = upstream.mock.callCount();
    for (const path of [
      "/tools/%68andbook/",
      "/tools/handbook/%2fprivate",
      "/tools/handbook/private",
      "/tools/labs/drawing-bom/other.zip",
      "/tools-api/v1/submissions/private/record",
    ]) {
      assert.equal(
        (await entry.fetch(new Request("https://mst-us.ai" + path))).status,
        404,
        path,
      );
    }
    assert.equal(
      (await entry.fetch(new Request("https://mst-sg.com/tools/handbook/")))
        .status,
      404,
    );
    assert.equal(
      (
        await entry.fetch(
          new Request("https://mst-us.ai/tools/handbook/", {
            method: "POST",
            body: "PRIVATE_SENTINEL",
          }),
        )
      ).status,
      405,
    );
    assert.equal(upstream.mock.callCount(), previous);
  } finally {
    upstream.mock.restore();
    await new Promise<void>((done) => fixture.close(() => done()));
  }
});

test("public document failures do not expose upstream errors, redirects or response headers", async (t) => {
  for (const response of [
    new Response("private error", { status: 500 }),
    new Response("", {
      status: 302,
      headers: { Location: "https://untrusted.invalid" },
    }),
    new Response("wrong file", {
      headers: { "Content-Type": "application/json" },
    }),
  ]) {
    const upstream = t.mock.method(globalThis, "fetch", async () => response);
    const result = await entry.fetch(
      new Request("https://mst-us.ai/tools/handbook/"),
    );
    assert.equal(result.status, 503);
    assert.doesNotMatch(
      await result.text(),
      /private error|untrusted|wrong file/,
    );
    assert.equal(result.headers.get("Location"), null);
    assert.equal(result.headers.get("Cache-Control"), "no-store");
    upstream.mock.restore();
  }
});

test("the shell can establish the fixed child connection early without broadening CSP", async () => {
  const response = await entry.fetch(
    new Request("https://mst-us.ai/tools/bom-check/"),
  );
  assert.equal(
    response.headers.get("Link"),
    "<https://tools.mst-us.ai>; rel=preconnect",
  );
  assert.match(
    response.headers.get("Content-Security-Policy")!,
    /default-src 'none'; frame-src https:\/\/tools.mst-us.ai blob:/,
  );
});
