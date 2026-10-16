const entries: Record<string, string> = {
  "drawing-to-bom": "Drawing to BOM",
  "bom-compare": "BOM Compare",
  "bom-check": "BOM CSV Checker",
  "drawing-register-compare": "Drawing Register Compare",
  "connection-table-check": "Connection Table Check",
  "line-list-check": "Line List Check",
  "bom-model-check": "BOM–Model Check",
  "delivery-package-check": "Delivery Package Check",
  "pid-tag-check": "P&ID Tag Check",
  "title-block-reader": "Title Block Reader",
};
function source(url: URL, request: Request) {
  const label = (url.searchParams.get("utm_source") || "").toLowerCase();
  if (["google", "bing", "github"].includes(label)) return label;
  if (["chatgpt", "chatgpt.com", "perplexity"].includes(label)) return "ai";
  if (["email", "newsletter"].includes(label)) return "email";
  if (label) return "campaign";
  let host = "";
  try {
    host = new URL(request.headers.get("Referer") || "").hostname;
  } catch {
    /* unknown */
  }
  if (!host) return "direct";
  if (["mst-us.ai", "tools.mst-us.ai"].includes(host)) return "internal";
  if (/(^|\.)google\.(com|co\.uk|com\.sg|co\.jp|de|fr)$/.test(host))
    return "google";
  if (host === "bing.com" || host.endsWith(".bing.com")) return "bing";
  if (host === "github.com") return "github";
  if (
    [
      "chatgpt.com",
      "perplexity.ai",
      "claude.ai",
      "copilot.microsoft.com",
    ].includes(host)
  )
    return "ai";
  return "referral";
}
// This route is an edge-owned shell. It never fetches the legacy website,
// receives files, reads request bodies, or handles private job capabilities.
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const headers = {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        // WebKit also checks a child's local Blob download against frame-src.
        // The script-free shell has no dynamic markup or Blob creation; its
        // only iframe still has the fixed trusted HTTPS source below.
        "default-src 'none'; frame-src https://tools.mst-us.ai blob:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    };
    const match = /^\/tools\/([a-z0-9-]+)(?:\/|\/index\.html)?$/.exec(
      url.pathname,
    );
    const slug = match?.[1] || "";
    if (url.origin !== "https://mst-us.ai" || !Object.hasOwn(entries, slug))
      return new Response("Not found", { status: 404, headers });
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", {
        status: 405,
        headers: { ...headers, Allow: "GET, HEAD" },
      });
    // Only allowlisted source labels and a fixed QA flag reach the child.
    // They are attribution hints, never credentials or verified identity.
    const params = new URLSearchParams();
    if (url.searchParams.get("mst_analytics_test") === "1")
      params.set("mst_analytics_test", "1");
    params.set("mst_source", source(url, request));
    const query = "?" + params.toString().replaceAll("&", "&amp;");
    const title = entries[slug].replaceAll("&", "&amp;");
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — MST Engineering Tools</title>
<meta name="description" content="Use MST engineering tools with private input, original attachment and result storage.">
<link rel="canonical" href="https://mst-us.ai/tools/${slug}/">
<style>html,body{margin:0;width:100%;height:100%;background:#f6f8fa}iframe{display:block;width:100%;height:100vh;height:100dvh;border:0}noscript{display:block;padding:1rem;font:16px system-ui}</style>
</head><body><iframe title="MST ${title}" src="https://tools.mst-us.ai/tools/${slug}/${query}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-downloads allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"></iframe>
<noscript>Enable JavaScript to run the tool and save your private record.</noscript></body></html>`;
    return new Response(request.method === "HEAD" ? null : html, { headers });
  },
};
