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
    if (
      url.origin !== "https://mst-us.ai" ||
      ![
        "/tools/drawing-to-bom",
        "/tools/drawing-to-bom/",
        "/tools/drawing-to-bom/index.html",
      ].includes(url.pathname)
    )
      return new Response("Not found", { status: 404, headers });
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", {
        status: 405,
        headers: { ...headers, Allow: "GET, HEAD" },
      });
    // Forward only a fixed QA flag. No user-supplied strings reach the markup.
    const query =
      url.searchParams.get("mst_analytics_test") === "1"
        ? "?mst_analytics_test=1"
        : "";
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Drawing to BOM — MST Engineering Tools</title>
<meta name="description" content="Upload a drawing PDF or image, review recognized BOM rows and export Excel with source and review details.">
<link rel="canonical" href="https://mst-us.ai/tools/drawing-to-bom/">
<style>html,body{margin:0;width:100%;height:100%;background:#f6f8fa}iframe{display:block;width:100%;height:100vh;height:100dvh;border:0}noscript{display:block;padding:1rem;font:16px system-ui}</style>
</head><body><iframe title="MST Drawing to BOM" src="https://tools.mst-us.ai/tools/drawing-to-bom/${query}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-downloads allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"></iframe>
<noscript>Enable JavaScript to upload your drawing and review the BOM.</noscript></body></html>`;
    return new Response(request.method === "HEAD" ? null : html, { headers });
  },
};
