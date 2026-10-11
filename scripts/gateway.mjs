// Deterministic, separately manifested HTTPS gateway artifact. Never edit a
// deployed bundle or route customer uploads through the legacy website host.
import { cp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
await rm("gateway-dist", { recursive: true, force: true });
await cp("dist", "gateway-dist", { recursive: true });
const prior = JSON.parse(await readFile("dist/release.json", "utf8"));
const files = [];
async function visit(directory = "gateway-dist") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }
    if (entry.name === "release.json") continue;
    if (/\.(?:html|js|css|json|xml|txt|svg)$/.test(entry.name)) {
      const before = await readFile(path, "utf8");
      const after = before
        .replaceAll(
          "https://mst-us.ai/tools",
          "https://mst-sg.com/engineering-tools",
        )
        .replaceAll("/tools-api/", "/engineering-tools-api/")
        .replaceAll("tools\\/", "engineering-tools\\/")
        .replaceAll("/tools/", "/engineering-tools/")
        .replaceAll('"/tools"', '"/engineering-tools"')
        // The WordPress collector only accepts its legacy /tools/ routes.
        // Upload/retrieval/export events are recorded by the private job API.
        .replace(
          /<script\b[^>]*src="\/engineering-tools\/analytics\/mst-site-visits-v1\.js[^"]*"[^>]*><\/script>/g,
          "",
        );
      await writeFile(path, after);
    }
    files.push({
      path: path.slice("gateway-dist/".length),
      sha256: createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    });
  }
}
await visit();
await writeFile(
  "gateway-dist/release.json",
  JSON.stringify(
    {
      ...prior,
      publicOrigin: "https://mst-sg.com",
      basePath: "/engineering-tools/",
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
    },
    null,
    2,
  ) + "\n",
);
