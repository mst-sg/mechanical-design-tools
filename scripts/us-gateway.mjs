// US private tool origin, separate from the SG path-remapped artifact.
import { cp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
await rm("us-gateway-dist", { recursive: true, force: true });
await cp("dist", "us-gateway-dist", { recursive: true });
const prior = JSON.parse(await readFile("dist/release.json", "utf8"));
const files = [];
async function visit(directory = "us-gateway-dist") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }
    if (entry.name === "release.json") continue;
    if (entry.name.endsWith(".html")) {
      const content = await readFile(path, "utf8");
      // Private API events are the usage ledger for this isolated origin.
      // Do not contact or load scripts from the legacy WordPress collector.
      await writeFile(
        path,
        content.replace(
          /<script\b[^>]*src="\/tools\/analytics\/mst-site-visits-v1\.js[^"]*"[^>]*><\/script>/g,
          "",
        ),
      );
    }
    files.push({
      path: path.slice("us-gateway-dist/".length),
      sha256: createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    });
  }
}
await visit();
await writeFile(
  "us-gateway-dist/release.json",
  JSON.stringify(
    {
      ...prior,
      publicOrigin: "https://tools.mst-us.ai",
      publicEntry: "https://mst-us.ai/tools/drawing-to-bom/",
      basePath: "/tools/",
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
    },
    null,
    2,
  ) + "\n",
);
