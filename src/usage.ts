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
export function startUsage(mode: UsageMode): UsageRun {
  try {
    active = window.MSTSiteVisits?.begin(mode) ?? emptyRun;
  } catch {
    active = emptyRun;
  }
  return active;
}
export function exportUsage() {
  active.export();
}
