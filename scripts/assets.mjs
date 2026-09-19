import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { PDFDocument } from "pdf-lib";
await mkdir("public/vendor", { recursive: true });
await mkdir("public/samples", { recursive: true });
for (const [from, to] of [
  [
    "node_modules/tesseract.js/dist/worker.min.js",
    "public/vendor/worker.min.js",
  ],
  [
    "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
    "public/vendor/pdf.worker.min.mjs",
  ],
  ["node_modules/pdfjs-dist/cmaps", "public/vendor/cmaps"],
  ["node_modules/pdfjs-dist/standard_fonts", "public/vendor/standard_fonts"],
  ["node_modules/pdfjs-dist/wasm", "public/vendor/pdf-wasm"],
])
  await cp(from, to, { recursive: true });
await mkdir("public/vendor/core", { recursive: true });
for (const file of await readdir("node_modules/tesseract.js-core"))
  if (/^tesseract-core.*\.(?:js|wasm)$/.test(file))
    await cp(
      join("node_modules/tesseract.js-core", file),
      join("public/vendor/core", file),
    );
await mkdir("public/vendor/lang", { recursive: true });
for (const lang of ["eng", "chi_sim"])
  await cp(
    `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
    `public/vendor/lang/${lang}.traineddata.gz`,
  );
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const notices = [];
for (const [path, meta] of Object.entries(lock.packages)) {
  if (!path || meta.dev) continue;
  let content = "";
  for (const file of await readdir(path).catch(() => []))
    if (/^licen[cs]e(?:\.|$)/i.test(file))
      content += (await readFile(join(path, file), "utf8")) + "\n";
  notices.push(
    `${path.replace(/^node_modules\//, "")} ${meta.version} — ${meta.license || "see package"}\n${content}`,
  );
}
notices.push(
  "Tesseract English and Simplified Chinese traineddata: https://github.com/tesseract-ocr/tessdata — Apache-2.0. Packaged by @tesseract.js-data/eng and @tesseract.js-data/chi_sim (1.0.0).",
  await readFile("node_modules/tesseract.js-core/LICENSE", "utf8"),
);
await writeFile(
  "public/THIRD_PARTY_NOTICES.txt",
  notices.join("\n\n---------------------------------------\n\n"),
);
const svg = await readFile("public/samples/bracket-bom.svg", "utf8");
const png = new Resvg(svg, {
  fitTo: { mode: "original" },
  font: { defaultFontFamily: "Arial" },
})
  .render()
  .asPng();
await writeFile("public/samples/bracket-bom.png", png);
const pdf = await PDFDocument.create();
pdf.setTitle("Synthetic bracket assembly — BOM recognition example");
pdf.setAuthor("MST Open Tools");
pdf.setCreationDate(new Date("2026-09-19T00:00:00Z"));
pdf.setModificationDate(new Date("2026-09-19T00:00:00Z"));
const image = await pdf.embedPng(png);
const page = pdf.addPage([1000, 680]);
page.drawImage(image, { x: 0, y: 0, width: 1000, height: 680 });
await writeFile("public/samples/bracket-bom.pdf", await pdf.save());
console.log(
  "Prepared self-hosted OCR/PDF assets, licenses and synthetic image/PDF samples.",
);
