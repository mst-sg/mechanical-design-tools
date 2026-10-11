import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createCanvas,
  loadImage,
  DOMMatrix,
  ImageData,
  Path2D,
} from "@napi-rs/canvas";
import { createWorker, PSM } from "tesseract.js";
import { removeTableRules } from "../src/preprocess";
import { extractTable, wordsFromTsv } from "../src/ocr-table";
import type { JobOptions, JobResult } from "../src/job-types";
let phase = "rendering",
  sent = false;
function send(value: unknown) {
  if (process.connected) process.send?.(value);
}
function failure(code: string) {
  if (sent) return;
  sent = true;
  if (process.connected)
    process.send?.({ type: "error", code }, () => process.exit(1));
  else process.exit(1);
}
process.on("uncaughtException", () =>
  failure(
    phase === "loading_model" ? "model_unavailable" : "recognition_failed",
  ),
);
process.on("unhandledRejection", () =>
  failure(
    phase === "loading_model" ? "model_unavailable" : "recognition_failed",
  ),
);
function progress(next: string, value = 0) {
  phase = next;
  send({ type: "progress", phase, progress: value });
}
function dimensions(bytes: Buffer, mime: string) {
  if (mime === "image/png") {
    if (bytes.length < 24 || bytes.toString("ascii", 12, 16) !== "IHDR")
      throw new Error("invalid_file");
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error("invalid_file");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length)
      throw new Error("invalid_file");
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      if (length < 7) throw new Error("invalid_file");
      return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
    }
    offset += length;
  }
  throw new Error("invalid_file");
}
function fit(width: number, height: number) {
  if (!Number.isFinite(width * height) || width <= 0 || height <= 0)
    throw new Error("invalid_file");
  const scale = Math.min(
    1,
    3200 / Math.max(width, height),
    Math.sqrt(8_000_000 / (width * height)),
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
process.once(
  "message",
  async (message: {
    source: string;
    mime: string;
    options: JobOptions;
    assets: string;
  }) => {
    try {
      const { source, mime, options, assets } = message;
      const bytes = readFileSync(source);
      progress("rendering");
      let canvas;
      if (mime === "application/pdf") {
        Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const task = pdfjs.getDocument({
          data: new Uint8Array(bytes),
          disableFontFace: true,
          useSystemFonts: false,
          standardFontDataUrl: join(assets, "standard_fonts") + "/",
          cMapUrl: join(assets, "cmaps") + "/",
          cMapPacked: true,
          wasmUrl: join(assets, "pdf-wasm") + "/",
          maxImageSize: 60_000_000,
          stopAtErrors: true,
        });
        try {
          const doc = await task.promise;
          if (doc.numPages > 500 || options.page > doc.numPages)
            throw new Error("invalid_options");
          const page = await doc.getPage(options.page),
            initial = page.getViewport({ scale: 3 }),
            size = fit(initial.width, initial.height);
          const viewport = page.getViewport({
            scale: (3 * size.width) / initial.width,
          });
          canvas = createCanvas(
            Math.ceil(viewport.width),
            Math.ceil(viewport.height),
          );
          await page.render({
            canvas: canvas as unknown as HTMLCanvasElement,
            canvasContext: canvas.getContext(
              "2d",
            ) as unknown as CanvasRenderingContext2D,
            viewport,
            background: "white",
          }).promise;
        } finally {
          await task.destroy();
        }
      } else {
        const [width, height] = dimensions(bytes, mime);
        if (width * height > 60_000_000) throw new Error("too_large");
        const image = await loadImage(bytes),
          size = fit(image.width, image.height);
        canvas = createCanvas(size.width, size.height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, size.width, size.height);
        ctx.drawImage(image, 0, 0, size.width, size.height);
      }
      const crop = options.crop,
        x = Math.round((canvas.width * crop.left) / 100),
        y = Math.round((canvas.height * crop.top) / 100);
      const width = Math.max(
        1,
        Math.min(
          canvas.width - x,
          Math.round((canvas.width * crop.width) / 100),
        ),
      );
      const height = Math.max(
        1,
        Math.min(
          canvas.height - y,
          Math.round((canvas.height * crop.height) / 100),
        ),
      );
      const clipped = createCanvas(width, height),
        ctx = clipped.getContext("2d");
      ctx.drawImage(canvas, x, y, width, height, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height);
      removeTableRules(pixels.data, width, height);
      ctx.putImageData(pixels, 0, 0);
      canvas.width = 1;
      canvas.height = 1;
      progress("loading_model");
      const worker = await createWorker(
        options.language === "chi_sim" ? ["eng", "chi_sim"] : "eng",
        1,
        {
          langPath: join(assets, "lang"),
          cacheMethod: "none",
          errorHandler: () =>
            failure(
              phase === "loading_model"
                ? "model_unavailable"
                : "recognition_failed",
            ),
          logger: (info) => {
            if (info.status === "recognizing text")
              progress("recognizing", info.progress);
          },
        },
      );
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
          preserve_interword_spaces: "1",
          user_defined_dpi: "300",
        });
        progress("recognizing");
        const { data } = await worker.recognize(
          clipped.toBuffer("image/png"),
          {},
          { text: true, tsv: true },
        );
        const extracted = extractTable(wordsFromTsv(data.tsv || ""));
        const result: JobResult = {
          rows: extracted.rows,
          text: data.text.slice(0, 500_000),
          message: extracted.message,
        };
        sent = true;
        send({ type: "result", result });
      } finally {
        await worker.terminate();
      }
    } catch (error) {
      const code =
        error instanceof Error &&
        ["invalid_file", "invalid_options", "too_large"].includes(error.message)
          ? error.message
          : phase === "rendering"
            ? "invalid_file"
            : phase === "loading_model"
              ? "model_unavailable"
              : "recognition_failed";
      failure(code);
    }
  },
);
