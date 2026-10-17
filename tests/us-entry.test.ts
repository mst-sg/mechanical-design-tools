import { test } from "node:test";
import assert from "node:assert/strict";
import entry from "../deploy/us-entry/worker";

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
