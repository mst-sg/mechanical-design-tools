import type { Word } from "../src/types";
import type { RecognitionEngine } from "../src/job-types";

export function paddleResult(value: unknown): {
  words: Word[];
  text: string;
  engine: RecognitionEngine;
} {
  const data = value as { words?: Word[]; engine?: RecognitionEngine };
  if (
    !data ||
    !Array.isArray(data.words) ||
    data.words.length > 10000 ||
    data.engine?.name !== "PaddleOCR" ||
    !/^gpu:\d+$/.test(data.engine.device) ||
    typeof data.engine.version !== "string" ||
    data.engine.version.length > 40 ||
    typeof data.engine.model !== "string" ||
    data.engine.model.length > 100
  )
    throw new Error("invalid Paddle response");
  const words = data.words.map((word) => {
    if (
      !word ||
      typeof word.text !== "string" ||
      word.text.length > 2000 ||
      ![word.x, word.y, word.width, word.height, word.confidence].every(
        Number.isFinite,
      ) ||
      word.x < 0 ||
      word.y < 0 ||
      word.width <= 0 ||
      word.height <= 0 ||
      word.x + word.width > 6400 ||
      word.y + word.height > 6400 ||
      word.confidence < 0 ||
      word.confidence > 100
    )
      throw new Error("invalid Paddle word");
    return {
      text: word.text,
      x: word.x,
      y: word.y,
      width: word.width,
      height: word.height,
      confidence: word.confidence,
    };
  });
  const text = words.map((word) => word.text).join("\n");
  if (text.length > 500000) throw new Error("large Paddle text");
  return {
    words,
    text,
    engine: {
      name: "PaddleOCR",
      version: data.engine.version,
      model: data.engine.model,
      device: data.engine.device,
    },
  };
}

export async function recognizePaddle(
  bytes: Uint8Array,
  base: string,
  token: string,
) {
  const url = new URL(base);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("invalid Paddle endpoint");
  const signal = AbortSignal.timeout(80000);
  let response: Response;
  do {
    response = await fetch(new URL("/ocr", url), {
      method: "POST",
      body: bytes as unknown as BodyInit,
      headers: {
        "Content-Type": "image/png",
        Authorization: `Bearer ${token}`,
      },
      signal,
      redirect: "error",
    });
    // A cancelled Node worker may leave one bounded GPU inference finishing.
    // Keep the next job queued at this boundary rather than cascading failures.
    if (response.status !== 503) break;
    await response.body?.cancel();
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, 500);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  } while (!signal.aborted);
  if (!response.ok || !response.body)
    throw new Error("Paddle service unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2 * 1024 * 1024) throw new Error("large Paddle response");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return paddleResult(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}
