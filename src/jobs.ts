import type {
  JobAccess,
  JobOptions,
  JobResult,
  JobSnapshot,
} from "./job-types";
import { terminal } from "./job-types";
const storageKey = "mst_bom_job_v1";
const historyKey = "mst_bom_saved_jobs_v2";
type SavedJob = JobAccess & { filename: string; createdAt: number };
function validAccess(v: unknown): v is JobAccess {
  const a = v as JobAccess;
  return !!a && /^[a-f0-9-]{36}$/.test(a.id) && /^[a-f0-9]{64}$/.test(a.token);
}
export function savedJobs(): SavedJob[] {
  try {
    const value = JSON.parse(localStorage.getItem(historyKey) || "[]");
    return Array.isArray(value)
      ? value
          .filter((raw: unknown): raw is SavedJob => {
            if (!validAccess(raw)) return false;
            const v = raw as SavedJob;
            return (
              typeof v.filename === "string" &&
              v.filename.length <= 240 &&
              Number.isFinite(v.createdAt)
            );
          })
          .slice(0, 1000)
      : [];
  } catch {
    return [];
  }
}
export function rememberJob(access: JobAccess | null, filename = "") {
  try {
    if (access) {
      localStorage.setItem(storageKey, JSON.stringify(access));
      const saved = savedJobs(),
        previous = saved.find((job) => job.id === access.id);
      if (previous || saved.length < 1000)
        localStorage.setItem(
          historyKey,
          JSON.stringify([
            {
              ...access,
              filename:
                filename.slice(0, 240) || previous?.filename || "Drawing",
              createdAt: previous?.createdAt || Date.now(),
            },
            ...saved.filter((job) => job.id !== access.id),
          ]),
        );
    } else localStorage.removeItem(storageKey);
    sessionStorage.removeItem(storageKey);
  } catch {
    /* The visitor can save a private receipt if browser storage is disabled. */
  }
}
export function forgetJob(access: JobAccess) {
  try {
    localStorage.setItem(
      historyKey,
      JSON.stringify(savedJobs().filter((job) => job.id !== access.id)),
    );
  } catch {
    /* Receipt remains usable only until server deletion. */
  }
  rememberJob(null);
}
export function rememberedJob(): JobAccess | null {
  try {
    const v = JSON.parse(
      localStorage.getItem(storageKey) ||
        sessionStorage.getItem(storageKey) ||
        "null",
    );
    return validAccess(v) ? v : null;
  } catch {
    return null;
  }
}
export function downloadJobReceipt(access: JobAccess) {
  const body = JSON.stringify(
    { version: 1, origin: location.origin, ...access },
    null,
    2,
  );
  const url = URL.createObjectURL(
    new Blob([body], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `mst-private-job-${access.id.slice(0, 8)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readJobReceipt(file: File): Promise<JobAccess> {
  if (file.size > 4096) throw new Error("Choose a private MST job receipt.");
  const value = JSON.parse(await file.text());
  if (
    value.version !== 1 ||
    value.origin !== location.origin ||
    !validAccess(value)
  )
    throw new Error(
      "This receipt is invalid or belongs to a different website.",
    );
  return { id: value.id, token: value.token };
}
function visitorId() {
  try {
    const prior = localStorage.getItem("mst_tools_visitor_v1");
    if (prior && /^[a-f0-9-]{36}$/.test(prior)) return prior;
    const id = crypto.randomUUID();
    localStorage.setItem("mst_tools_visitor_v1", id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
export function newJob(): JobAccess {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  return { id: crypto.randomUUID(), token };
}
export class JobError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}
async function request(
  access: JobAccess,
  action: string,
  init: RequestInit = {},
  signal?: AbortSignal,
  timeout = 12000,
): Promise<Response> {
  const controller = new AbortController(),
    cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = window.setTimeout(cancel, timeout);
  try {
    const response = await fetch(`/tools-api/v1/jobs/${access.id}${action}`, {
      ...init,
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${access.token}`, ...init.headers },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new JobError(
        error?.message ||
          `The server could not complete this request (${response.status}). Please try again.`,
        response.status,
      );
    }
    return response;
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (error instanceof JobError) throw error;
    throw new JobError(
      "The connection to the server was interrupted. Check your connection, then check this job again.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
export async function uploadJob(
  access: JobAccess,
  file: File,
  options: JobOptions,
  signal: AbortSignal,
  contactEmail = "",
): Promise<JobSnapshot> {
  const mime =
    file.type ||
    (/\.pdf$/i.test(file.name)
      ? "application/pdf"
      : /\.png$/i.test(file.name)
        ? "image/png"
        : "image/jpeg");
  return (
    await request(
      access,
      "",
      {
        method: "POST",
        headers: {
          "Content-Type": mime,
          "X-MST-Job-Options": JSON.stringify(options),
          "X-MST-Upload-Context": encodeURIComponent(
            JSON.stringify({
              visitorId: visitorId(),
              filename: file.name.slice(0, 240),
              contactEmail: contactEmail.trim(),
              referrerHost: (() => {
                try {
                  return document.referrer
                    ? new URL(document.referrer).hostname
                    : "";
                } catch {
                  return "";
                }
              })(),
            }),
          ),
        },
        body: file,
      },
      signal,
      45000,
    )
  ).json();
}
function delay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, 1000);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
  });
}
export async function waitForJob(
  access: JobAccess,
  signal: AbortSignal,
  onStatus: (job: JobSnapshot) => void,
): Promise<JobResult> {
  const deadline = Date.now() + 240000;
  let failures = 0;
  while (Date.now() < deadline) {
    let job: JobSnapshot;
    try {
      job = await (await request(access, "", {}, signal)).json();
      failures = 0;
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof JobError && [404, 410, 403].includes(error.status)) ||
        ++failures >= 3
      )
        throw error;
      await delay(signal);
      continue;
    }
    onStatus(job);
    if (terminal(job.state)) {
      if (job.state !== "succeeded" && job.state !== "empty")
        throw new JobError(job.message || "Processing stopped. Try again.");
      return (await request(access, "/result", {}, signal)).json();
    }
    await delay(signal);
  }
  throw new JobError(
    "The server is still processing this job. Check its status again shortly.",
  );
}
export const jobEvent = (access: JobAccess, event: "shown" | "exported") =>
  // These bodyless events must survive a reload after a local file download.
  // Keep this separate from uploads, which remain cancellable and size-bounded.
  request(access, `/${event}`, { method: "POST", keepalive: true }).catch(
    () => {},
  );
export async function cancelJob(access: JobAccess) {
  await request(access, "/cancel", { method: "POST" });
}
export async function deleteJob(access: JobAccess) {
  try {
    await request(access, "", { method: "DELETE" });
  } catch (error) {
    if (!(error instanceof JobError && [404, 410].includes(error.status)))
      throw error;
  }
}
