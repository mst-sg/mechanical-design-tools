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

import { cp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
  "server-dist/paddle-service.py",
  "server-dist/paddle-supervisor.py",
  "deploy/Dockerfile.gpu-runtime",
  "deploy/start-isolated-jobs.sh",
];
await cp("server/paddle-service.py", "server-dist/paddle-service.py");
await cp("server/paddle-supervisor.py", "server-dist/paddle-supervisor.py");
await rm("server-assets", { recursive: true, force: true });
for (const directory of ["lang", "standard_fonts", "cmaps", "pdf-wasm"])
  await cp(`public/vendor/${directory}`, `server-assets/${directory}`, {
    recursive: true,
  });
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile()) paths.push(path);
    else throw new Error(`Unexpected server asset: ${path}`);
  }
}
await collect("server-assets");
paths.sort();
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
