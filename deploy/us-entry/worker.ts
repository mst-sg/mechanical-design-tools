import { toolPages, type Section, type ToolPage } from "./page-content";
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
    "bom-compare": {
      description:
        "Compare two BOM revisions by part number. Review added, removed and changed parts and export CSV.",
      handbook: "revisions",
    },
    "bom-check": {
      description:
        "Check a BOM CSV for duplicate part numbers, missing quantities and conflicting fields. Review the findings and export a checked CSV.",
      handbook: "duplicates",
    },
  };
const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
// JSON-LD is an inert data block: the browser never executes it, so the
// shell's CSP (default-src 'none') still applies and no script can run.
const jsonLd = (slug: string, page: ToolPage) =>
  JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: page.applicationName,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web browser",
        url: `https://mst-us.ai/tools/${slug}/`,
        description: page.description,
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        publisher: {
          "@type": "Organization",
          name: "MST",
          url: "https://mst-us.ai/",
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: page.faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  }).replaceAll("<", "\\u003c");
function renderSection(section: Section): string {
  const head = `<section id="${section.id}"><h2>${escapeHtml(section.heading)}</h2>`;
  if ("paragraphs" in section)
    return (
      head +
      section.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("") +
      "</section>"
    );
  if ("io" in section)
    return (
      head +
      "<dl>" +
      section.io
        .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`)
        .join("") +
      "</dl></section>"
    );
  const tag = section.ordered ? "ol" : "ul";
  return (
    head +
    `<${tag}>` +
    section.list.map((li) => `<li>${escapeHtml(li)}</li>`).join("") +
    `</${tag}></section>`
  );
}
function renderArticle(page: ToolPage): string {
  return (
    `<main class="entry-article" id="guide">` +
    page.sections.map(renderSection).join("") +
    `<section id="faq"><h2>Frequently asked questions</h2>` +
    page.faq
      .map(
        (item) => `<h3>${escapeHtml(item.q)}</h3><p>${escapeHtml(item.a)}</p>`,
      )
      .join("") +
    `</section><section id="related"><h2>Related</h2><ul>` +
    page.related
      .map((l) => `<li><a href="${l.href}">${escapeHtml(l.label)}</a></li>`)
      .join("") +
    `</ul></section><section id="about"><h2>About MST</h2><p>This is a free tool from MST. MST AI Engineer has three modules: drawing to model, layout and connections, and mechanical assembly AI, which takes a P&amp;ID gas-line diagram plus approved PDM parts and equipment rules and builds a native, editable SOLIDWORKS assembly, starting with semiconductor gas equipment. <a href="/product/">Learn about MST AI Engineer</a>.</p></section></main>`
  );
}
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
    const page = Object.hasOwn(toolPages, slug) ? toolPages[slug] : undefined;
    const introduction = introductions[slug];
    const description = escapeHtml(
      page?.description ||
        introduction?.description ||
        "Use MST engineering tools with private input, original attachment and result storage.",
    );
    const pageTitle = page
      ? escapeHtml(page.seoTitle)
      : `${title} — MST Engineering Tools`;
    const guideQuery = params.has("mst_analytics_test")
      ? "?mst_analytics_test=1"
      : "";
    const introHtml = introduction
      ? `<header class="entry-intro"><h1>${title}</h1><p>${description} <a href="/tools/handbook/${guideQuery}#${introduction.handbook}">How to use this tool</a>${page ? ' · <a href="#guide">Guide and FAQ</a>' : ""}</p></header>`
      : "";
    const pageStyle =
      ".tool-page{display:block;height:auto}.tool-page iframe{height:max(560px,calc(100vh - 100px));height:max(560px,calc(100dvh - 100px));min-height:0}.entry-article{box-sizing:border-box;max-width:860px;margin:0 auto;padding:32px 24px 56px;background:#fff;color:#24312b;font:16px/1.6 system-ui,sans-serif}.entry-article h2{margin:32px 0 8px;font-size:22px;line-height:1.3}.entry-article h2:first-child{margin-top:0}.entry-article h3{margin:20px 0 4px;font-size:17px}.entry-article p,.entry-article ul,.entry-article ol,.entry-article dd{margin:0 0 12px}.entry-article dt{font-weight:600;margin-top:8px}.entry-article dd{margin-left:0}.entry-article li{margin-bottom:6px}.entry-article a{color:#325b43;text-underline-offset:3px}@media(max-width:600px){.entry-article{padding:24px 16px 40px}}";
    const introStyle = introduction
      ? ".tool-entry{display:flex;flex-direction:column;height:100vh;height:100dvh}.entry-intro{flex:none;padding:12px 24px;border-bottom:1px solid #d8e0e7;background:#fff;color:#24312b;font:15px/1.5 system-ui,sans-serif}.entry-intro h1{margin:0 0 3px;font-size:20px;line-height:1.3}.entry-intro p{margin:0}.entry-intro a{color:#325b43;text-underline-offset:3px}.entry-intro a:focus-visible{outline:2px solid #325b43;outline-offset:3px}.tool-entry iframe{flex:1;min-height:0}@media(max-width:600px){.entry-intro{padding:10px 16px}}" +
        (page ? pageStyle : "")
      : "";
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${pageTitle}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="https://mst-us.ai/tools/${slug}/">${
      page
        ? `
<meta property="og:type" content="website"><meta property="og:site_name" content="MST"><meta property="og:title" content="${pageTitle}"><meta property="og:description" content="${description}"><meta property="og:url" content="https://mst-us.ai/tools/${slug}/">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${pageTitle}"><meta name="twitter:description" content="${description}">
<script type="application/ld+json">${jsonLd(slug, page)}</script>`
        : ""
    }
<style>html,body{margin:0;width:100%;${page ? "" : "height:100%;"}background:#f6f8fa}iframe{display:block;width:100%;height:100vh;height:100dvh;border:0}noscript{display:block;padding:1rem;font:16px system-ui}${introStyle}</style>
</head><body${introduction ? ` class="tool-entry${page ? " tool-page" : ""}"` : ""}>${introHtml}<iframe title="MST ${title}" src="https://tools.mst-us.ai/tools/${slug}/${query}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-downloads allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"></iframe>
<noscript>Enable JavaScript to run the tool and save your private record.</noscript>${page ? renderArticle(page) : ""}</body></html>`;
    return new Response(request.method === "HEAD" ? null : html, {
      headers: {
        ...headers,
        Link: "<https://tools.mst-us.ai>; rel=preconnect",
      },
    });
  },
};
