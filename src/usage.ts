import { tools } from "./catalog";
// Only fixed actions and input-mode enums cross the first-party boundary.
export type UsageMode = "sample" | "provided" | "default";
export type UsageRun = { complete: () => void; export: () => void };
const emptyRun: UsageRun = { complete() {}, export() {} };
let active = emptyRun;
declare global {
  interface Window {
    MSTSiteVisits?: { begin: (mode: UsageMode) => UsageRun };
  }
}
const extensions = [
  "png", "jpg", "jpeg", "pdf", "csv", "tsv", "txt", "xls", "xlsx", "json",
  "zip", "dwg", "dxf",
];
export function usageSizeBucket(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes < 10 * 1024) return "<10KB";
  if (bytes < 100 * 1024) return "10-100KB";
  if (bytes < 1024 * 1024) return "100KB-1MB";
  return bytes <= 10 * 1024 * 1024 ? "1-10MB" : ">10MB";
}
export function usageExtension(name: string) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  if (!m) return "none";
  const ext = m[1].toLowerCase();
  return extensions.includes(ext) ? ext : "other";
}
// Aggregate-only beacon: the action, a tool slug, an allow-listed extension and
// a size bucket. File names and contents never leave the browser here.
export function reportUsage(
  action: "select_file" | "export",
  file?: { name: string; size: number },
) {
  try {
    if (
      location.hostname !== "tools.mst-us.ai" &&
      location.hostname !== "mst-sg.com" &&
      !["127.0.0.1", "localhost"].includes(location.hostname)
    )
      return;
    if (
      navigator.doNotTrack === "1" ||
      (navigator as Navigator & { globalPrivacyControl?: boolean })
        .globalPrivacyControl ||
      localStorage.getItem("mst_internal_traffic") === "1"
    )
      return;
    const tool = tools.find((t) => location.pathname.endsWith("/" + t.slug));
    if (!tool) return;
    void fetch("/tools-api/v1/usage", {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        v: 1,
        eventId: crypto.randomUUID(),
        tool: tool.slug,
        action,
        ext: file ? usageExtension(file.name) : "none",
        size: file ? usageSizeBucket(file.size) : "unknown",
        traffic:
          new URL(location.href).searchParams.get("mst_analytics_test") ===
            "1" || navigator.webdriver
            ? "test"
            : "browser",
      }),
      keepalive: true,
    })
      .then((response) => response.arrayBuffer())
      .catch(() => {});
  } catch {
    /* Usage counting must never affect the tool. */
  }
}
export function startUsage(mode: UsageMode): UsageRun {
  let run = emptyRun;
  try {
    run = window.MSTSiteVisits?.begin(mode) ?? emptyRun;
  } catch {
    run = emptyRun;
  }
  active = {
    complete: () => run.complete(),
    export: () => {
      run.export();
      reportUsage("export");
    },
  };
  return active;
}
export function exportUsage() {
  active.export();
}
