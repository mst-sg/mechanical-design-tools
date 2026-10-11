import type {
  JobAccess,
  JobOptions,
  JobResult,
  JobSnapshot,
} from "./job-types";
import { terminal } from "./job-types";
const storageKey = "mst_bom_job_v1";
export function rememberJob(access: JobAccess | null) {
  try {
    if (access) sessionStorage.setItem(storageKey, JSON.stringify(access));
    else sessionStorage.removeItem(storageKey);
  } catch {
    /* Processing still works when storage is disabled. */
  }
}
export function rememberedJob(): JobAccess | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    return v && /^[a-f0-9-]{36}$/.test(v.id) && /^[a-f0-9]{64}$/.test(v.token)
      ? v
      : null;
  } catch {
    return null;
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
  request(access, `/${event}`, { method: "POST" }).catch(() => {});
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
