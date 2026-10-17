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
const introductions: Record<string, { description: string; handbook: string }> =
  {
    "drawing-to-bom": {
      description:
        "Read an existing parts table from a PNG, JPEG or PDF. Review the rows and export Excel or CSV.",
      handbook: "drawing-bom",
    },
    "bom-check": {
      description:
        "Check a BOM CSV for duplicate part numbers, missing quantities and conflicting fields. Review the findings and export a checked CSV.",
      handbook: "duplicates",
    },
  };
// Public documentation only. This is not a general proxy or private API route.
const documents: Record<
  string,
  { path: string; type: string; upstreamType?: string }
> = {
  "/tools/handbook": { path: "/tools/handbook/", type: "text/html" },
  "/tools/handbook/": { path: "/tools/handbook/", type: "text/html" },
  "/tools/handbook/index.html": {
    path: "/tools/handbook/index.html",
    type: "text/html",
  },
  "/tools/labs/drawing-bom/handbook.html": {
    path: "/tools/labs/drawing-bom/handbook.html",
    type: "text/html",
  },
  "/tools/labs/drawing-bom/drawing-bom-lab.zip": {
    path: "/tools/labs/drawing-bom/drawing-bom-lab.zip",
    type: "application/zip",
  },
  "/tools/labs/drawing-bom/SHA256SUMS": {
    path: "/tools/labs/drawing-bom/SHA256SUMS",
    type: "text/plain",
    upstreamType: "application/octet-stream",
  },
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
// Its fixed public document routes read only the trusted static release.
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
    if (url.origin !== "https://mst-us.ai" || url.pathname.includes("%"))
      return new Response("Not found", { status: 404, headers });
    const document = Object.hasOwn(documents, url.pathname)
      ? documents[url.pathname]
      : undefined;
    if (document) {
      if (!["GET", "HEAD"].includes(request.method))
        return new Response("Method not allowed", {
          status: 405,
          headers: { ...headers, Allow: "GET, HEAD" },
        });
      const documentHeaders = {
        ...headers,
        "Content-Type":
          document.type +
          (document.type.startsWith("text/") ? "; charset=utf-8" : ""),
        "Content-Security-Policy":
          "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      };
      try {
        // Do not forward the visitor's query, cookies, authorization or headers.
        // Redirects fail closed, even if the trusted origin is misconfigured.
        const upstream = await fetch(
          "https://tools.mst-us.ai" + document.path,
          {
            method: request.method,
            headers: { Accept: document.type },
            // Workerd supports manual redirects, but not redirect: "error".
            // The status check below rejects every redirect without following it.
            redirect: "manual",
            signal: AbortSignal.timeout(15000),
          },
        );
        if (
          upstream.status !== 200 ||
          upstream.headers.get("Content-Type")?.split(";")[0].trim() !==
            (document.upstreamType || document.type)
        ) {
          await upstream.body?.cancel();
          throw new Error("Public document unavailable");
        }
        return new Response(request.method === "HEAD" ? null : upstream.body, {
          headers: documentHeaders,
        });
      } catch {
        return new Response(
          "The handbook is temporarily unavailable. Please retry.",
          { status: 503, headers },
        );
      }
    }
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
    const introduction = introductions[slug];
    const description =
      introduction?.description ||
      "Use MST engineering tools with private input, original attachment and result storage.";
    const guideQuery = params.has("mst_analytics_test")
      ? "?mst_analytics_test=1"
      : "";
    const introHtml = introduction
      ? `<header class="entry-intro"><h1>${title}</h1><p>${description} <a href="/tools/handbook/${guideQuery}#${introduction.handbook}">How to use this tool</a></p></header>`
      : "";
    const introStyle = introduction
      ? ".tool-entry{display:flex;flex-direction:column;height:100vh;height:100dvh}.entry-intro{flex:none;padding:12px 24px;border-bottom:1px solid #d8e0e7;background:#fff;color:#24312b;font:15px/1.5 system-ui,sans-serif}.entry-intro h1{margin:0 0 3px;font-size:20px;line-height:1.3}.entry-intro p{margin:0}.entry-intro a{color:#325b43;text-underline-offset:3px}.entry-intro a:focus-visible{outline:2px solid #325b43;outline-offset:3px}.tool-entry iframe{flex:1;min-height:0}@media(max-width:600px){.entry-intro{padding:10px 16px}}"
      : "";
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — MST Engineering Tools</title>
<meta name="description" content="${description}">
<link rel="canonical" href="https://mst-us.ai/tools/${slug}/">
<style>html,body{margin:0;width:100%;height:100%;background:#f6f8fa}iframe{display:block;width:100%;height:100vh;height:100dvh;border:0}noscript{display:block;padding:1rem;font:16px system-ui}${introStyle}</style>
</head><body${introduction ? ' class="tool-entry"' : ""}>${introHtml}<iframe title="MST ${title}" src="https://tools.mst-us.ai/tools/${slug}/${query}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-downloads allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"></iframe>
<noscript>Enable JavaScript to run the tool and save your private record.</noscript></body></html>`;
    return new Response(request.method === "HEAD" ? null : html, {
      headers: {
        ...headers,
        Link: "<https://tools.mst-us.ai>; rel=preconnect",
      },
    });
  },
};
