import { createWorker, PSM } from "tesseract.js";
import type { Crop } from "./types";
import { removeTableRules } from "./preprocess";
import { wordsFromTsv, extractTable, linesFromWords } from "./ocr-table";
import { prepareOcrCore } from "./ocr-core";
export async function recognizeDrawing(
  url: string,
  crop: Crop,
  language: string,
  signal: AbortSignal,
  onProgress: (message: string, value: number) => void,
) {
  const data = await recognizeText(
    url,
    crop,
    language,
    signal,
    onProgress,
    "table",
  );
  return { ...extractTable(wordsFromTsv(data.tsv ?? "")), text: data.text };
}
export async function recognizeText(
  url: string,
  crop: Crop,
  language: string,
  signal: AbortSignal,
  onProgress: (message: string, value: number) => void,
  mode: "table" | "text" | "tags" = "text",
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
  const scale =
    mode !== "table"
      ? Math.max(
          1,
          Math.min(2, 3200 / w, 3200 / h, Math.sqrt(8_000_000 / (w * h))),
        )
      : 1;
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, x, y, w, h, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (mode !== "table") {
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value =
        (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3 < 200
          ? 0
          : 255;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    }
  }
  removeTableRules(pixels.data, canvas.width, canvas.height);
  ctx.putImageData(pixels, 0, 0);
  const corePath = await prepareOcrCore(signal, onProgress);
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
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
      corePath,
      langPath: "/tools/vendor/lang",
      cacheMethod: "none",
      logger: (info) => {
        if (!signal.aborted)
          onProgress(
            info.status === "recognizing text"
              ? mode === "table"
                ? "Reading the parts table…"
                : "Reading printed text…"
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
      // The block pass retains tag labels near symbols that sparse segmentation
      // can discard. Title fields use sparse segmentation plus word positions.
      tessedit_pageseg_mode:
        mode === "text" ? PSM.SPARSE_TEXT : PSM.SINGLE_BLOCK,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
    const { data } = await Promise.race([
      worker.recognize(canvas, {}, { text: true, tsv: true }),
      cancelled,
    ]);
    return {
      text: data.text,
      tsv: data.tsv ?? "",
      layoutText: linesFromWords(wordsFromTsv(data.tsv ?? ""))
        .map((line) => line.map((w) => w.text).join(" "))
        .join("\n"),
    };
  } finally {
    signal.removeEventListener("abort", onAbort);
    if (worker) await worker.terminate();
    canvas.width = 1;
    canvas.height = 1;
  }
}
