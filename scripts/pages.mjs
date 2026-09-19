import { createServer } from "vite";
import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const template = await readFile("dist/index.html", "utf8");
const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
const { tools } = await server.ssrLoadModule("/src/catalog.ts");
const pages = [
  [
    "",
    "Free Mechanical Design Tools | MST",
    "Free browser tools to extract BOMs, check data, compare revisions, read title blocks and reconcile P&ID tags.",
  ],
  ...tools.map((tool) => [
    tool.slug,
    `${tool.name} — Free Online Engineering Tool | MST`,
    tool.description,
  ]),
];
try {
  const { render } = await server.ssrLoadModule("/src/prerender.tsx");
  for (const [slug, title, description] of pages) {
    const path = slug ? `/tools/${slug}` : "/tools";
    const url = `https://mst-us.ai${path}/`;
    const html = render(path);
    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": slug ? "SoftwareApplication" : "CollectionPage",
      name: title.split(" | ")[0],
      url,
      description,
      ...(slug
        ? {
            applicationCategory: "DesignApplication",
            operatingSystem: "Web browser",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }
        : {}),
    });
    const csp =
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'";
    const output = template
      .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
      .replace(
        /<meta name="description" content="[^"]*">/,
        `<meta name="description" content="${description}">`,
      )
      .replace(
        /<link rel="canonical" href="[^"]*">/,
        `<link rel="canonical" href="${url}">`,
      )
      .replace(
        "</head>",
        `<meta http-equiv="Content-Security-Policy" content="${csp}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${url}"><script type="application/ld+json">${schema}</script></head>`,
      )
      .replace(
        /<div id="root">[\s\S]*?<\/div><\/body>/,
        `<div id="root">${html}</div></body>`,
      );
    const directory = slug ? `dist/${slug}` : "dist";
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/index.html`, output);
  }
} finally {
  await server.close();
}
await writeFile(
  "dist/sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(([s]) => `<url><loc>https://mst-us.ai/tools/${s ? s + "/" : ""}</loc></url>`).join("")}</urlset>`,
);
const notices = await readFile("public/THIRD_PARTY_NOTICES.txt", "utf8");
const esc = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
await writeFile(
  "dist/licenses.html",
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Open-source licenses | MST Tools</title><body style="max-width:900px;margin:30px auto;padding:20px;font:15px system-ui"><a href="/tools/">Back to tools</a><h1>Open-source licenses</h1><p>MST tool code is MIT licensed. Libraries and language data retain their original licenses.</p><pre style="white-space:pre-wrap">${esc(notices)}</pre></body></html>`,
);
const files = [];
async function walk(dir = "dist") {
  for (const f of (await readdir(dir)).sort()) {
    const path = `${dir}/${f}`;
    if ((await stat(path)).isDirectory()) await walk(path);
    else
      files.push({
        path: path.slice(5),
        sha256: createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      });
  }
}
await walk();
let commit = "local";
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
} catch {}
await writeFile(
  "dist/release.json",
  JSON.stringify(
    { repository: "mst-sg/mechanical-design-tools", commit, files },
    null,
    2,
  ) + "\n",
);
console.log(
  `Prerendered ${pages.length} crawlable tool pages; ${files.length} hashed files.`,
);
