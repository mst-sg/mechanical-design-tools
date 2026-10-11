import { build } from "esbuild";
await build({
  entryPoints: [
    "server/main.ts",
    "server/worker.ts",
    "server/report.ts",
    "server/cleanup.ts",
  ],
  outdir: "server-dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
});

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const paths = [
  "server-dist/main.mjs",
  "server-dist/worker.mjs",
  "server-dist/report.mjs",
  "server-dist/cleanup.mjs",
  "package.json",
  "package-lock.json",
  "deploy/mst-tools-jobs.service",
  "deploy/mst-tools-jobs-cleanup.service",
  "deploy/mst-tools-jobs-cleanup.timer",
  "deploy/nginx-tools-api.conf",
];
const files = await Promise.all(
  paths.map(async (path) => ({
    path,
    sha256: createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
  })),
);
await writeFile(
  "server-release.json",
  JSON.stringify(
    {
      repository: "mst-sg/mechanical-design-tools",
      commit: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      files,
    },
    null,
    2,
  ) + "\n",
);
