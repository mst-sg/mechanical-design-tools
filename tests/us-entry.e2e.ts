import { test, expect } from "@playwright/test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createJobService } from "../server/app";
import { configuration } from "../server/config";
import { paddleDouble } from "./fixtures/paddle-double";
import entry from "../deploy/us-entry/worker";

// Local routed-host contract, never production. Inference is an explicit double;
// API origin checks, browser isolation, download and job persistence are real.
test("US root shell isolates uploads and recovery in its child origin and downloads Excel", async ({
  page,
}, info) => {
  const root = "https://mst-us.ai",
    child = "https://tools.mst-us.ai";
  const directory = await mkdtemp(join(tmpdir(), "mst-us-origin-e2e-"));
  const paddle = await paddleDouble();
  const gatewayToken = "local-test-us-gateway-only".repeat(3);
  const service = createJobService(
    configuration({
      dataDir: directory,
      origin: child,
      workerPath: resolve("server-dist/worker.mjs"),
      assetsDir: resolve("server-assets"),
      gatewayAddress: "127.0.0.1",
      gatewayToken,
      trustProxy: true,
      paddleUrl: paddle.url,
      paddleToken: paddle.token,
    }),
  );
  await new Promise<void>((done) =>
    service.server.listen(0, "127.0.0.1", done),
  );
  const address = service.server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture port");
  const uploaded = await readFile("public/samples/bracket-bom.png");
  const errors: string[] = [],
    origins = new Set<string>();
  page.on("pageerror", (error) => errors.push(error.message));
  const csp = (await readFile("deploy/nginx-us-tools.conf", "utf8")).match(
    /add_header Content-Security-Policy "([^"]+)"/,
  )![1];
  try {
    await page.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (["blob:", "data:"].includes(url.protocol)) return route.continue();
      origins.add(url.origin);
      if (url.origin === root) {
        const response = await entry.fetch(
          new Request(request.url(), { method: request.method() }),
        );
        return route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: await response.text(),
        });
      }
      expect(url.origin).toBe(child);
      if (url.pathname.startsWith("/tools-api/")) {
        const headers: Record<string, string> = {
          ...request.headers(),
          "x-mst-gateway-token": gatewayToken,
          "x-real-ip": "203.0.113.7",
        };
        delete headers["content-length"];
        delete headers.host;
        delete headers.cookie;
        // WebKit interception does not preserve binary postData. The only file
        // selected in this contract is the exact owned sample PNG below.
        const upload =
          request.method() === "POST" &&
          /\/jobs\/[a-f0-9-]+$/.test(url.pathname);
        const response = await fetch(
          `http://127.0.0.1:${address.port}${url.pathname}`,
          {
            method: request.method(),
            headers,
            body:
              ((upload
                ? uploaded
                : request.postDataBuffer()) as unknown as BodyInit) ||
              undefined,
          },
        );
        return route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: Buffer.from(await response.arrayBuffer()),
        });
      }
      expect(url.pathname.startsWith("/tools/")).toBe(true);
      expect(url.pathname).not.toContain("analytics");
      const path =
        url.pathname.slice("/tools/".length) +
        (url.pathname.endsWith("/") ? "index.html" : "");
      const types: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".json": "application/json",
        ".wasm": "application/wasm",
      };
      return route.fulfill({
        contentType: types[extname(path)] || "application/octet-stream",
        headers: {
          "Content-Security-Policy": csp,
          "Cache-Control": "no-store",
        },
        body: await readFile(resolve("us-gateway-dist", path)),
      });
    });
    const publicUrl = root + "/tools/drawing-to-bom/?mst_analytics_test=1";
    await page.goto(publicUrl);
    await expect(
      page.getByRole("heading", { name: "Drawing to BOM", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "How to use this tool" }),
    ).toHaveAttribute(
      "href",
      "/tools/handbook/?mst_analytics_test=1#drawing-bom",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const tool = page.frameLocator('iframe[title="MST Drawing to BOM"]');
    await expect(
      tool.getByRole("button", { name: "Try a sample", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `.artifacts/${info.project.name}-us-entry-intro.png`,
      fullPage: true,
    });
    await tool
      .getByRole("button", { name: "Try a sample", exact: true })
      .click();
    await tool
      .getByRole("button", { name: "Extract BOM", exact: true })
      .click();
    await expect(
      tool.getByLabel("Row 1 Part number", { exact: true }),
    ).toHaveValue("BRK-100");
    expect(page.url()).toBe(publicUrl);
    expect(await page.locator('input[type="file"]').count()).toBe(0);
    expect(
      await page.evaluate(() => {
        try {
          return Boolean(
            document.querySelector("iframe")!.contentWindow!.document,
          );
        } catch (error) {
          return (error as DOMException).name;
        }
      }),
    ).toBe("SecurityError");
    expect(
      await page.evaluate(() => localStorage.getItem("mst_bom_job_v1")),
    ).toBeNull();
    const record = service.store.all()[0];
    expect(
      await readFile(join(service.store.dir(record.id), "source")),
    ).toEqual(uploaded);
    const pending = page.waitForEvent("download", { timeout: 15000 });
    await tool.getByRole("button", { name: "Export Excel" }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe("bom-draft.xlsx");
    await download.saveAs(`.artifacts/${info.project.name}-us-embedded.xlsx`);
    const csvPending = page.waitForEvent("download", { timeout: 15000 });
    await tool.getByRole("button", { name: "Export CSV" }).click();
    expect((await csvPending).suggestedFilename()).toBe("bom-reviewed.csv");
    const receiptPending = page.waitForEvent("download", { timeout: 15000 });
    await tool
      .getByRole("button", { name: "Save private job receipt" })
      .click();
    const receipt = JSON.parse(
      await readFile((await (await receiptPending).path())!, "utf8"),
    );
    expect(receipt.origin).toBe(child);
    expect(receipt.id).toBe(record.id);
    await page.reload();
    await expect(
      tool.getByLabel("Row 1 Part number", { exact: true }),
    ).toHaveValue("BRK-100");
    expect(service.store.all()).toHaveLength(1);
    expect([...origins].sort()).toEqual([root, child].sort());
    await page.screenshot({
      path: `.artifacts/${info.project.name}-us-entry.png`,
      fullPage: true,
    });
    await tool.getByRole("button", { name: "Delete server files" }).click();
    await expect(
      tool.getByRole("button", { name: "Delete server files" }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await service.close();
    await paddle.close();
    await rm(directory, { recursive: true, force: true });
  }
});
