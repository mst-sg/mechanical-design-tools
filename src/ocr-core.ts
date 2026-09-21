import { relaxedSimd, simd } from "wasm-feature-detect";

class MissingCore extends Error {}

// Fetch before importScripts so a stalled component request can be cancelled
// and retried. Only public engine bytes enter the normal HTTP cache.
export async function downloadCore(
  url: string,
  signal: AbortSignal,
  onRetry: () => void,
  idleMs = 12_000,
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted();
    const request = new AbortController();
    const cancel = () => request.abort(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => request.abort(new Error("Download stalled")),
        idleMs,
      );
    };
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      resetTimer();
      const response = await fetch(url, {
        signal: request.signal,
        cache: "default",
      });
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500)
          throw new MissingCore(
            "The recognition component is unavailable. Please try again later.",
          );
        throw new Error("Recognition component download failed");
      }
      if (!response.body) throw new Error("Recognition component was empty");
      reader = response.body.getReader();
      resetTimer();
      while (!(await reader.read()).done) resetTimer();
      signal.throwIfAborted();
      return;
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof MissingCore) throw error;
      if (attempt === 1)
        throw new Error(
          "The recognition engine could not finish downloading. Your drawing is still here. Check your connection and try reading it again.",
        );
    } finally {
      clearTimeout(timer!);
      signal.removeEventListener("abort", cancel);
      // Aborting fetch also interrupts a pending response-body read.
      request.abort();
      await reader?.cancel().catch(() => {});
      reader?.releaseLock();
    }
    onRetry();
  }
}

export async function prepareOcrCore(
  signal: AbortSignal,
  onProgress: (message: string, value: number) => void,
) {
  const variant = (await relaxedSimd())
    ? "relaxedsimd-"
    : (await simd())
      ? "simd-"
      : "";
  const path = `/tools/vendor/core/tesseract-core-${variant}lstm.wasm.js`;
  onProgress("Downloading recognition engine…", 0);
  await downloadCore(path, signal, () =>
    onProgress("Download stalled. Retrying recognition engine…", 0),
  );
  return path;
}
