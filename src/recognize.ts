import { createWorker, PSM } from "tesseract.js";
import type { Crop } from "./types";
import { removeTableRules } from "./preprocess";
import { wordsFromTsv, extractTable } from "./ocr-table";
export async function recognizeDrawing(
  url: string,
  crop: Crop,
  language: string,
  signal: AbortSignal,
  onProgress: (message: string, value: number) => void,
) {
  const image = new Image();
  image.src = url;
  await image.decode();
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const canvas = document.createElement("canvas");
  const x = Math.round((image.width * crop.left) / 100),
    y = Math.round((image.height * crop.top) / 100),
    w = Math.max(1, Math.round((image.width * crop.width) / 100)),
    h = Math.max(1, Math.round((image.height * crop.height) / 100));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(image, x, y, w, h, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h);
  removeTableRules(pixels.data, w, h);
  ctx.putImageData(pixels, 0, 0);
  onProgress("Loading recognition engine…", 0);
  let rejectCancel: ((reason: Error) => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    rejectCancel = reject;
  });
  const onAbort = () =>
    rejectCancel?.(new DOMException("Cancelled", "AbortError"));
  signal.addEventListener("abort", onAbort, { once: true });
  const ready = createWorker(
    language === "chi_sim" ? ["eng", "chi_sim"] : "eng",
    1,
    {
      workerPath: "/tools/vendor/worker.min.js",
      corePath: "/tools/vendor/core",
      langPath: "/tools/vendor/lang",
      cacheMethod: "none",
      logger: (info) => {
        if (!signal.aborted)
          onProgress(
            info.status === "recognizing text"
              ? "Reading the parts table…"
              : "Loading recognition engine…",
            info.status === "recognizing text" ? info.progress : 0,
          );
      },
    },
  );
  // Cancellation during model loading returns immediately; dispose the worker
  // when initialization settles so a cancelled run cannot overwrite a later one.
  void ready
    .then((worker) => {
      if (signal.aborted) void worker.terminate();
    })
    .catch(() => {});
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    worker = await Promise.race([ready, cancelled]);
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: "1",
    });
    const { data } = await Promise.race([
      worker.recognize(canvas, {}, { text: true, tsv: true }),
      cancelled,
    ]);
    return { ...extractTable(wordsFromTsv(data.tsv ?? "")), text: data.text };
  } finally {
    signal.removeEventListener("abort", onAbort);
    if (worker) await worker.terminate();
    canvas.width = 1;
    canvas.height = 1;
  }
}
