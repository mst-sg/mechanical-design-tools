import { test } from "node:test";
import assert from "node:assert/strict";
import entry from "../deploy/us-entry/worker";

test("US entry stays on root URL and hosts only the separate private tool origin", async () => {
  for (const path of ["", "/", "/index.html"]) {
    const response = await entry.fetch(
      new Request(
        "https://mst-us.ai/tools/drawing-to-bom" +
          path +
          "?mst_analytics_test=1&token=PRIVATE&next=https://example.invalid",
      ),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Location"), null);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const html = await response.text();
    assert.match(
      html,
      /src="https:\/\/tools.mst-us.ai\/tools\/drawing-to-bom\/\?mst_analytics_test=1"/,
    );
    assert.match(html, /allow-same-origin allow-downloads/);
    assert.doesNotMatch(
      html,
      /PRIVATE|example.invalid|mst-sg|<script|postMessage|<input/i,
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
