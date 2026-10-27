import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { JobStore } from "./store";
import { jsonBody, SubmissionError } from "./submissions";
import { submissionTools } from "../src/submission-types";
import { UUID } from "./input";
import { visitorContext } from "./visitor-context";

// Minimal, privacy-preserving daily usage aggregate. One counter row per
// (day, tool, action, country, /24 hash, extension, size bucket, has-email,
// internal). No file names, contents, e-mail addresses, IP addresses or
// visitor identifiers are ever stored here.
export const usageActions = [
  "select_file",
  "start",
  "success",
  "fail",
  "export",
] as const;
export type UsageAction = (typeof usageActions)[number];
export const sizeBuckets = [
  "<10KB",
  "10-100KB",
  "100KB-1MB",
  "1-10MB",
  ">10MB",
  "unknown",
] as const;
// Allow-list: an arbitrary extension could itself carry personal text.
export const usageExtensions = [
  "png",
  "jpg",
  "jpeg",
  "pdf",
  "csv",
  "tsv",
  "txt",
  "xls",
  "xlsx",
  "json",
  "zip",
  "dwg",
  "dxf",
  "other",
  "none",
] as const;
export type UsageOrigin = {
  tool: string;
  country: string;
  net24: string;
  ext: string;
  size: string;
  email: "yes" | "no" | "unknown";
  internal: 0 | 1;
};
export function sizeBucket(bytes: number | null | undefined) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0)
    return "unknown";
  if (bytes < 10 * 1024) return "<10KB";
  if (bytes < 100 * 1024) return "10-100KB";
  if (bytes < 1024 * 1024) return "100KB-1MB";
  if (bytes <= 10 * 1024 * 1024) return "1-10MB";
  return ">10MB";
}
export function fileExtension(name: string) {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(name || "");
  if (!match) return "none";
  const ext = match[1].toLowerCase();
  return (usageExtensions as readonly string[]).includes(ext) ? ext : "other";
}
function prefix(ip: string): string {
  if (isIP(ip) === 4) return ip.split(".").slice(0, 3).join(".");
  const mapped = /^::ffff:(\d+\.\d+\.\d+)\.\d+$/i.exec(ip);
  if (mapped) return mapped[1];
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const a = head ? head.split(":") : [];
  const b = tail ? tail.split(":") : [];
  const groups = [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b];
  return groups
    .slice(0, 3)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":");
}
// /24 (IPv4) or /48 (IPv6) network, keyed so it cannot be reversed offline.
export function net24Hash(key: Buffer, ip: string) {
  return createHmac("sha256", key)
    .update("usage-net24:" + prefix(ip))
    .digest("hex")
    .slice(0, 16);
}
const QA_AGENT = /playwright|headlesschrome|curl\/|mst retained-tool qa/i;
function inNet(ip: string, nets: string[]) {
  if (isIP(ip) !== 4) return false;
  const p = prefix(ip);
  return nets.some((n) => {
    const m = /^(\d+\.\d+\.\d+)\.0\/24$/.exec(n.trim());
    return m ? m[1] === p : false;
  });
}
export function isInternal(
  store: JobStore,
  ip: string,
  userAgent: string,
  traffic: string,
) {
  return (
    traffic === "test" ||
    QA_AGENT.test(userAgent) ||
    inNet(ip, store.config.internalNets)
  )
    ? 1
    : 0;
}
export function usageOrigin(
  store: JobStore,
  req: IncomingMessage,
  ip: string,
  fields: {
    tool: string;
    filename?: string;
    bytes?: number | null;
    hasEmail?: boolean;
    traffic?: string;
  },
): UsageOrigin {
  return {
    tool: fields.tool,
    country: String(visitorContext(req, store.config).country || "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 2),
    net24: net24Hash(store.key, ip),
    ext: fileExtension(fields.filename || ""),
    size: sizeBucket(fields.bytes),
    email:
      fields.hasEmail === undefined ? "unknown" : fields.hasEmail ? "yes" : "no",
    internal: isInternal(
      store,
      ip,
      String(req.headers["user-agent"] || ""),
      fields.traffic || "browser",
    ),
  };
}
const rates = new Map<string, { until: number; count: number }>();
// Browser beacon for the two actions only the browser can see. Starts,
// successes and failures are recorded by the server lifecycle itself, and
// Drawing to BOM exports are recorded by its server-side "exported" event.
export async function recordUsageBeacon(
  store: JobStore,
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (req.method !== "POST")
    throw new SubmissionError(405, "forbidden", "POST required.");
  const done = () => {
    res.writeHead(204);
    res.end();
  };
  if (req.headers.dnt === "1" || req.headers["sec-gpc"] === "1") {
    req.resume();
    return done();
  }
  const { value } = await jsonBody(req, 1024);
  const bad = () =>
    new SubmissionError(400, "invalid_usage", "Invalid usage event.");
  if (
    !value ||
    Object.keys(value).sort().join(",") !==
      "action,eventId,ext,size,tool,traffic,v" ||
    value.v !== 1 ||
    !UUID.test(value.eventId) ||
    !submissionTools.includes(value.tool) ||
    !["select_file", "export"].includes(value.action) ||
    !(usageExtensions as readonly string[]).includes(value.ext) ||
    !(sizeBuckets as readonly string[]).includes(value.size) ||
    !["browser", "test"].includes(value.traffic)
  )
    throw bad();
  const ip = store.config.trustProxy
    ? String(req.headers["x-real-ip"] || "")
    : String(req.socket.remoteAddress || "");
  if (!isIP(ip)) throw bad();
  const now = Date.now(),
    key = store.address(ip, now);
  const rate = rates.get(key);
  if (rate && rate.until > now && rate.count >= 120) return done();
  if (rate && rate.until > now) rate.count++;
  else rates.set(key, { until: now + 60000, count: 1 });
  if (rates.size > 5000)
    for (const [k, v] of rates) if (v.until <= now) rates.delete(k);
  if (rates.size > 5000) return done();
  // Drawing to BOM exports already arrive through the job lifecycle.
  if (value.action === "export" && value.tool === "drawing-to-bom")
    return done();
  const day = new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
  store.db
    .prepare("DELETE FROM visitor_events WHERE day<?")
    .run(new Date(now - 86400_000).toISOString().slice(0, 10));
  const fresh = store.db
    .prepare("INSERT OR IGNORE INTO visitor_events VALUES(?,?)")
    .run("usage:" + value.eventId, day);
  if (!fresh.changes) return done();
  store.usageBump(
    {
      ...usageOrigin(store, req, ip, { tool: value.tool, traffic: value.traffic }),
      ext: value.ext,
      size: value.size,
    },
    value.action,
    now,
  );
  done();
}
