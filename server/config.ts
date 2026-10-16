import { resolve } from "node:path";
export type Config = {
  dataDir: string;
  assetsDir: string;
  workerPath: string;
  origin: string;
  retentionMs: number;
  jobTimeoutMs: number;
  uploadTimeoutMs: number;
  queueTimeoutMs: number;
  maxBytes: number;
  maxStoredBytes: number;
  concurrency: number;
  maxPending: number;
  hourlyLimit: number;
  perAddressPending: number;
  trustProxy: boolean;
  gatewayToken: string;
  operatorToken: string;
  gatewayAddress: string;
  paddleUrl: string;
  paddleToken: string;
  minFreeBytes: number;
};
export function configuration(overrides: Partial<Config> = {}): Config {
  const origin =
    overrides.origin ?? process.env.MST_JOBS_ORIGIN ?? "http://127.0.0.1:4173";
  return {
    dataDir: resolve(process.env.MST_JOBS_DATA || ".private-jobs"),
    assetsDir: resolve(process.env.MST_JOBS_ASSETS || "public/vendor"),
    workerPath: resolve("server-dist/worker.mjs"),
    origin,
    // Zero means retained until the visitor or an administrator deletes it.
    retentionMs: Number(process.env.MST_JOBS_RETENTION_DAYS || 0) * 86400_000,
    jobTimeoutMs: 90_000,
    uploadTimeoutMs: origin === "https://mst-sg.com" ? 300_000 : 45_000,
    queueTimeoutMs: 120_000,
    maxBytes: 25 * 1024 * 1024,
    maxStoredBytes: 20 * 1024 * 1024 * 1024,
    concurrency: 1,
    maxPending: 12,
    hourlyLimit: 20,
    perAddressPending: 2,
    trustProxy: process.env.MST_JOBS_TRUST_PROXY === "1",
    gatewayToken: process.env.MST_JOBS_GATEWAY_TOKEN || "",
    operatorToken: process.env.MST_JOBS_OPERATOR_READ_TOKEN || "",
    gatewayAddress: process.env.MST_JOBS_GATEWAY_ADDRESS || "",
    paddleUrl: process.env.MST_JOBS_PADDLE_URL || "http://127.0.0.1:7018",
    paddleToken: process.env.MST_JOBS_PADDLE_TOKEN || "",
    minFreeBytes: 2 * 1024 * 1024 * 1024,
    ...overrides,
  };
}
export const errors: Record<string, string> = {
  invalid_file:
    "This file could not be read. Choose a valid PNG, JPEG or unencrypted PDF.",
  invalid_options:
    "The selected page or recognition area is invalid. Select it again.",
  too_large:
    "Choose a file smaller than 25 MB and an image below 60 megapixels.",
  model_unavailable:
    "The recognition service could not load its model. Please try again shortly.",
  recognition_failed:
    "The server could not finish reading this drawing. Please retry or try another page.",
  timed_out:
    "Recognition took too long and was stopped. Try a smaller area or a simpler page.",
  queue_timeout: "The server was busy for too long. Please try again shortly.",
  interrupted:
    "Processing was interrupted by a service restart. Please upload the drawing again.",
  upload_failed:
    "The upload did not finish. Check your connection and try again.",
  cancelled: "Processing cancelled. You can start again.",
  busy: "The recognition service is busy. Please try again in a moment.",
  rate_limit: "Too many recent uploads. Please try again later.",
  unavailable:
    "The recognition service is temporarily unavailable. Please try again shortly.",
  not_found:
    "This job is unavailable or has expired. Upload the drawing again.",
  forbidden: "Open this tool on its own website to use server processing.",
  not_ready: "The result is not ready yet.",
};
