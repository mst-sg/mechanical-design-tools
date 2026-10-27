import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

await mkdir("us-entry-dist", { recursive: true });
await build({
  entryPoints: ["deploy/us-entry/worker.ts"],
  outfile: "us-entry-dist/worker.mjs",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: false,
});
await build({
  entryPoints: ["deploy/us-seo-edge/worker.ts"],
  outfile: "us-entry-dist/seo-edge.mjs",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: false,
});
const worker = await readFile("us-entry-dist/worker.mjs");
const edge = await readFile("us-entry-dist/seo-edge.mjs");
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
await writeFile(
  "us-entry-dist/release.json",
  JSON.stringify(
    {
      commit,
      file: "worker.mjs",
      sha256: createHash("sha256").update(worker).digest("hex"),
      seoEdge: {
        file: "seo-edge.mjs",
        sha256: createHash("sha256").update(edge).digest("hex"),
      },
    },
    null,
    2,
  ) + "\n",
);
