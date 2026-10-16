import { test } from "node:test";
import assert from "node:assert/strict";
import entry from "../deploy/us-entry/worker";

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
