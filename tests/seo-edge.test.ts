import { test } from "node:test";
import assert from "node:assert/strict";
import edge, {
  appendSitemap,
  rewriteDrawingToModel,
  rewriteProduct,
} from "../deploy/us-seo-edge/worker";

const robots =
  "User-agent: *\nAllow: /\n\nSitemap: https://mst-us.ai/wp-sitemap.xml\nSitemap: https://mst-us.ai/tools/sitemap.xml\n";

test("robots.txt gains the sitemap line once and keeps every existing line", () => {
  const out = appendSitemap(robots);
  assert.ok(out.startsWith(robots.trimEnd()));
  assert.equal(
    out.match(/^Sitemap: https:\/\/mst-us\.ai\/sitemap\.xml$/gm)?.length,
    1,
  );
  assert.equal(appendSitemap(out), out);
  assert.ok(out.endsWith("\n"));
});

const oldTitle =
  "Create editable Revit families from 2D three-view drawings | MST";
const oldDescription =
  "Generate editable Revit families from front, top and side drawings. See MST\u2019s reconstruction workflow and the checks for geometry, editing and project use.";

test("drawing-to-model title and descriptions drop Revit-only wording", () => {
  const html = `<title>${oldTitle}</title><meta name="description" content="${oldDescription}"><meta property="og:title" content="${oldTitle}"><meta name="twitter:description" content="${oldDescription}"><h1>Create editable Revit families from 2D three-view drawings</h1>`;
  const out = rewriteDrawingToModel(html);
  assert.match(out, /<title>2D CAD to 3D Model Generation \| Drawing to Model/);
  assert.doesNotMatch(out.replace(/<h1>.*<\/h1>/, ""), /Revit/);
  assert.match(out, /3D models from 2D CAD drawings/);
  // The visible heading is CMS content and is not touched here.
  assert.match(out, /<h1>Create editable Revit/);
  assert.equal(
    rewriteDrawingToModel("<title>Other</title>"),
    "<title>Other</title>",
  );
});

test("product description matches the three-module positioning", () => {
  const html =
    '<meta name="description" content="Create editable Revit families from 2D CAD drawings with three views, or native SOLIDWORKS assemblies from P&amp;ID connections and approved parts.">{"description":"x Its drawing-reconstruction module generates editable Revit families from 2D three-view drawings, with y"}';
  const out = rewriteProduct(html);
  assert.doesNotMatch(out, /Revit/);
  assert.match(
    out,
    /drawing to model, layout and connections, and mechanical assembly AI/,
  );
  assert.match(
    out,
    /Its drawing-to-model module generates 3D models from 2D CAD drawings, with y/,
  );
});

test("the Worker rewrites only matching 200 GET responses and passes everything else through", async (t) => {
  let next = new Response(robots, {
    headers: { "Content-Type": "text/plain; charset=utf-8", ETag: "abc" },
  });
  t.mock.method(globalThis, "fetch", async () => next.clone());
  const robotsResponse = await edge.fetch(
    new Request("https://mst-us.ai/robots.txt"),
  );
  assert.match(
    await robotsResponse.text(),
    /Sitemap: https:\/\/mst-us\.ai\/sitemap\.xml/,
  );
  assert.equal(robotsResponse.headers.get("X-MST-Edge-SEO"), "robots");
  assert.equal(robotsResponse.headers.get("ETag"), null);

  next = new Response(robots, {
    status: 404,
    headers: { "Content-Type": "text/plain" },
  });
  const missing = await edge.fetch(new Request("https://mst-us.ai/robots.txt"));
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), robots);

  next = new Response("x", { headers: { "Content-Type": "text/html" } });
  const other = await edge.fetch(new Request("https://mst-us.ai/robots.txt"));
  assert.equal(await other.text(), "x");
  const post = await edge.fetch(
    new Request("https://mst-us.ai/robots.txt", { method: "POST", body: "p" }),
  );
  assert.equal(await post.text(), "x");

  next = new Response(`<title>${oldTitle}</title>`, {
    headers: { "Content-Type": "text/html; charset=UTF-8" },
  });
  const page = await edge.fetch(
    new Request("https://mst-us.ai/2d-cad-to-3d-model-generation/"),
  );
  assert.match(await page.text(), /Drawing to Model/);
});
