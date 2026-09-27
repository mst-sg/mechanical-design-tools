import type { Request } from "@playwright/test";
export function isVisitRequest(request: Request): boolean {
  if (request.method() !== "POST") return false;
  const path = new URL(request.url()).pathname;
  try {
    const body = request.postDataJSON();
    const base =
      body.traffic === "test" &&
      /^\/tools\//.test(body.path) &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        body.event_id,
      ) &&
      [
        "direct",
        "internal",
        "bing",
        "google",
        "baidu",
        "duckduckgo",
        "yahoo",
        "ai",
        "social",
        "email",
        "campaign",
        "github",
        "referral",
      ].includes(body.source);
    if (path === "/wp-json/mst-visits/v1/page-view")
      return (
        base &&
        body.v === 1 &&
        Object.keys(body).sort().join(",") === "event_id,path,source,traffic,v"
      );
    return (
      path === "/wp-json/mst-visits/v1/tool-event" &&
      base &&
      body.v === 2 &&
      Object.keys(body).sort().join(",") ===
        "action,event_id,mode,path,run_id,source,tool,traffic,v" &&
      [
        "tool_start",
        "tool_complete",
        "tool_export",
        "resource_download",
      ].includes(body.action) &&
      ["sample", "provided", "default"].includes(body.mode) &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        body.run_id,
      ) &&
      (body.action === "resource_download"
        ? body.tool === "resource"
        : body.path === `/tools/${body.tool}/`)
    );
  } catch {
    return false;
  }
}
