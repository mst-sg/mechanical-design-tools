// Edge SEO overlay for pages served by WordPress, which this repository cannot
// edit. It forwards every request to the origin unchanged and then makes only
// exact, allowlisted text replacements. If the origin text no longer contains
// the expected strings (for example after the CMS is corrected), nothing is
// changed, and any error returns the origin response untouched. Retire this
// Worker once the same text is fixed in the CMS.
const SITEMAP = "https://mst-us.ai/sitemap.xml";

const DRAWING_TO_MODEL = {
  title: "2D CAD to 3D Model Generation | Drawing to Model | MST AI Engineer",
  description:
    "MST AI Engineer\u2019s drawing-to-model module generates 3D models from 2D CAD drawings. See the workflow and the checks for geometry and editing.",
  oldTitle: "Create editable Revit families from 2D three-view drawings | MST",
  oldDescription:
    "Generate editable Revit families from front, top and side drawings. See MST\u2019s reconstruction workflow and the checks for geometry, editing and project use.",
};
const PRODUCT = {
  description:
    "MST AI Engineer for equipment design: drawing to model, layout and connections, and mechanical assembly AI that builds native, editable SOLIDWORKS assemblies.",
  oldDescription:
    "Create editable Revit families from 2D CAD drawings with three views, or native SOLIDWORKS assemblies from P&amp;ID connections and approved parts.",
  oldSchemaText:
    "Its drawing-reconstruction module generates editable Revit families from 2D three-view drawings",
  schemaText:
    "Its drawing-to-model module generates 3D models from 2D CAD drawings",
};

export function appendSitemap(robots: string): string {
  if (/^sitemap:\s*https:\/\/mst-us\.ai\/sitemap\.xml\s*$/im.test(robots))
    return robots;
  return robots.replace(/\s*$/, "\n") + `\nSitemap: ${SITEMAP}\n`;
}

export function rewriteDrawingToModel(html: string): string {
  const withTitle = html
    .replaceAll(
      `<title>${DRAWING_TO_MODEL.oldTitle}</title>`,
      `<title>${DRAWING_TO_MODEL.title}</title>`,
    )
    .replaceAll(
      `content="${DRAWING_TO_MODEL.oldTitle}"`,
      `content="${DRAWING_TO_MODEL.title}"`,
    );
  return withTitle.replaceAll(
    DRAWING_TO_MODEL.oldDescription,
    DRAWING_TO_MODEL.description,
  );
}

export function rewriteProduct(html: string): string {
  return html
    .replaceAll(PRODUCT.oldDescription, PRODUCT.description)
    .replaceAll(PRODUCT.oldSchemaText, PRODUCT.schemaText);
}

const pages: Record<string, (html: string) => string> = {
  "/2d-cad-to-3d-model-generation/": rewriteDrawingToModel,
  "/product/": rewriteProduct,
};

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = await fetch(request);
    try {
      const url = new URL(request.url);
      if (request.method !== "GET" || origin.status !== 200) return origin;
      const type = origin.headers.get("Content-Type") || "";
      if (url.pathname === "/robots.txt" && type.startsWith("text/plain")) {
        const body = appendSitemap(await origin.text());
        const headers = new Headers(origin.headers);
        headers.delete("Content-Length");
        headers.delete("ETag");
        headers.set("X-MST-Edge-SEO", "robots");
        return new Response(body, { status: 200, headers });
      }
      const rewrite = Object.hasOwn(pages, url.pathname)
        ? pages[url.pathname]
        : undefined;
      if (rewrite && type.startsWith("text/html")) {
        const html = await origin.text();
        const headers = new Headers(origin.headers);
        headers.delete("Content-Length");
        headers.delete("ETag");
        headers.set("X-MST-Edge-SEO", "meta");
        return new Response(rewrite(html), { status: 200, headers });
      }
    } catch {
      /* fall through to the untouched origin response */
    }
    return origin;
  },
};
