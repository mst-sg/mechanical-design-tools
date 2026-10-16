import { BlockList, isIP } from "node:net";
import type { IncomingMessage } from "node:http";
import type { Config } from "./config";

// https://www.cloudflare.com/ips/ — reviewed 2026-10-16. The gateway
// overwrites both headers; the service authenticates that hop before use.
const edge = new BlockList();
for (const cidr of [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
]) {
  const [address, prefix] = cidr.split("/");
  edge.addSubnet(
    address,
    Number(prefix),
    isIP(address) === 6 ? "ipv6" : "ipv4",
  );
}
export function preferredLanguage(raw: string) {
  const choices = raw
    .slice(0, 512)
    .split(",")
    .slice(0, 16)
    .map((part, order) => {
      const match =
        /^\s*([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3})(?:\s*;\s*q=(0(?:\.\d{1,3})?|1(?:\.0{1,3})?))?\s*$/.exec(
          part,
        );
      if (!match || match[1].length > 35) return null;
      const language = match[1]
        .split("-")
        .map((v, i) =>
          i === 0
            ? v.toLowerCase()
            : /^[A-Za-z]{2}$/.test(v)
              ? v.toUpperCase()
              : /^[A-Za-z]{4}$/.test(v)
                ? v[0].toUpperCase() + v.slice(1).toLowerCase()
                : v.toLowerCase(),
        )
        .join("-");
      return {
        language,
        q: match[2] === undefined ? 1 : Number(match[2]),
        order,
      };
    })
    .filter((v) => v && v.q > 0);
  choices.sort((a, b) => b!.q - a!.q || a!.order - b!.order);
  return choices[0]?.language || "";
}
export function visitorContext(req: IncomingMessage, config: Config) {
  const peer = String(req.headers["x-mst-edge-peer"] || "");
  const raw = String(req.headers["x-mst-edge-country"] || "");
  const version = isIP(peer);
  const trusted =
    config.trustProxy &&
    !!config.gatewayToken &&
    !!version &&
    edge.check(peer, version === 6 ? "ipv6" : "ipv4");
  const country =
    trusted &&
    /^[A-Z]{2}$/.test(raw) &&
    !["AA", "AP", "EU", "XX", "ZZ"].includes(raw)
      ? raw
      : "";
  return {
    v: 1,
    browser_language: preferredLanguage(
      String(req.headers["accept-language"] || ""),
    ),
    browser_language_source: "accept_language",
    page_language: "en",
    country,
    country_source: country ? "cloudflare" : "unknown",
  };
}
