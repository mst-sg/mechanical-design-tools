import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";

test("trusted gateway artifact loads its own assets, uploads, and records private job phases", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop-chromium",
    "Build mount/telemetry contract; UI flows covered on all browsers.",
  );
  const jobEvents: string[] = [];
  const events: Record<string, unknown>[] = [],
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const origin = "https://mst-sg.com";
  await page.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    expect(url.origin).toBe(origin);
    if (url.pathname.startsWith("/wp-json/mst-visits/")) {
      events.push(req.postDataJSON());
      return route.fulfill({ status: 204 });
    }
    if (url.pathname.startsWith("/engineering-tools-api/")) {
      if (req.method() === "POST" && /\/(shown|exported)$/.test(url.pathname))
        jobEvents.push(url.pathname.split("/").at(-1)!);
      const headers: Record<string, string> = { ...req.headers(), origin: "http://127.0.0.1:4173" };
      delete headers["content-length"];
      delete headers.host;
      const response = await fetch(
        "http://127.0.0.1:4174" +
          url.pathname.replace("/engineering-tools-api/", "/tools-api/"),
        {
          method: req.method(),
          headers,
          body: (req.postDataBuffer() as unknown as BodyInit) || undefined,
        },
      );
      return route.fulfill({
        status: response.status,
        contentType: response.headers.get("content-type") || "application/json",
        body: Buffer.from(await response.arrayBuffer()),
      });
    }
    expect(url.pathname.startsWith("/engineering-tools/")).toBe(true);
    const relative =
      url.pathname.slice("/engineering-tools/".length) +
      (url.pathname.endsWith("/") ? "index.html" : "");
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".json": "application/json",
      ".wasm": "application/wasm",
    };
    return route.fulfill({
      status: 200,
      contentType: types[extname(relative)] || "application/octet-stream",
      body: await readFile(resolve("gateway-dist", relative)),
    });
  });
  await page.goto(
    origin + "/engineering-tools/drawing-to-bom/?mst_analytics_test=1",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    origin + "/engineering-tools/drawing-to-bom/",
  );
  await page.getByRole("button", { name: "Try a sample", exact: true }).click();
  await page.getByRole("button", { name: "Extract BOM", exact: true }).click();
  await expect(
    page.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveValue("BRK-100");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  await download;
  await expect.poll(() => jobEvents).toEqual(["shown", "exported"]);
  expect(events).toEqual([]);
  await page.getByRole("button", { name: "Delete server files" }).click();
  expect(errors).toEqual([]);
});
