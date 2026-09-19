import type { PDFDocumentProxy } from "pdfjs-dist";
export type Drawing = {
  url: string;
  width: number;
  height: number;
  name: string;
};
export const MAX_FILE = 25 * 1024 * 1024;
export function fitSize(width: number, height: number) {
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
export async function loadImage(file: Blob, name: string): Promise<Drawing> {
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 60_000_000)
      throw new Error(
        "This image is too large. Export a crop smaller than 60 megapixels.",
      );
    const size = fitSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    Object.assign(canvas, size);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, size.width, size.height);
    return { url: await canvasUrl(canvas), ...size, name };
  } finally {
    bitmap.close();
  }
}
export async function openPdf(file: File): Promise<PDFDocumentProxy> {
  const pdf = await import("pdfjs-dist");
  pdf.GlobalWorkerOptions.workerSrc = "/tools/vendor/pdf.worker.min.mjs";
  try {
    return await pdf.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      useSystemFonts: true,
      cMapUrl: "/tools/vendor/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/tools/vendor/standard_fonts/",
      wasmUrl: "/tools/vendor/pdf-wasm/",
    }).promise;
  } catch {
    throw new Error(
      "This PDF could not be opened. Use an unencrypted PDF or export the BOM page as PNG.",
    );
  }
}
export async function pdfPage(
  doc: PDFDocumentProxy,
  page: number,
  name: string,
): Promise<Drawing> {
  const p = await doc.getPage(page);
  try {
    const initial = p.getViewport({ scale: 3 });
    const size = fitSize(initial.width, initial.height);
    const viewport = p.getViewport({ scale: (3 * size.width) / initial.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await p.render({ canvas, viewport, background: "white" }).promise;
    return {
      url: await canvasUrl(canvas),
      width: canvas.width,
      height: canvas.height,
      name,
    };
  } finally {
    p.cleanup();
  }
}
export async function fileKind(file: File): Promise<"pdf" | "image"> {
  if (file.size > MAX_FILE)
    throw new Error("Choose a file smaller than 25 MB.");
  const b = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (b[0] === 37 && b[1] === 80 && b[2] === 68 && b[3] === 70) return "pdf";
  if (
    (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) ||
    (b[0] === 255 && b[1] === 216)
  )
    return "image";
  throw new Error("Choose a PNG, JPEG or PDF drawing.");
}

function canvasUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(URL.createObjectURL(blob))
          : reject(new Error("The drawing could not be rendered.")),
      "image/png",
    ),
  );
}
