import { test, expect } from "@playwright/test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createJobService } from "../server/app";
import { configuration } from "../server/config";
import entry from "../deploy/us-entry/worker";

test("US iframe confirms private deletion without browser modals and preserves cancel/retry/receipts", async ({
  page,
}, info) => {
  page.setDefaultTimeout(15000);
  const root = "https://mst-us.ai",
    child = "https://tools.mst-us.ai";
  const directory = await mkdtemp(join(tmpdir(), "mst-us-delete-e2e-"));
  const gatewayToken = "local-us-deletion-gateway".repeat(3);
  const service = createJobService(
    configuration({
      dataDir: directory,
      origin: child,
      workerPath: resolve("server-dist/worker.mjs"),
      assetsDir: resolve("server-assets"),
      gatewayAddress: "127.0.0.1",
      gatewayToken,
      trustProxy: true,
    }),
  );
  await new Promise<void>((done) =>
    service.server.listen(0, "127.0.0.1", done),
  );
  const address = service.server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture port");
  const csv = Buffer.from(
    "Part number,Description,Quantity\nQA-55,Owned synthetic spacer,2\n",
  );
  const errors: string[] = [],
    dialogs: string[] = [];
  let deletes = 0,
    rejectDelete = true;
  let releaseDelete: (() => void) | undefined;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss();
  });
  const csp = (await readFile("deploy/nginx-us-tools.conf", "utf8")).match(
    /add_header Content-Security-Policy "([^"]+)"/,
  )![1];
  try {
    await page.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (["blob:", "data:"].includes(url.protocol)) return route.continue();
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
        if (request.method() === "DELETE") {
          deletes++;
          if (rejectDelete) {
            rejectDelete = false;
            await new Promise<void>((done) => {
              releaseDelete = done;
            });
            return route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({
                message: "Synthetic deletion temporarily unavailable.",
              }),
            });
          }
        }
        const headers: Record<string, string> = {
          ...request.headers(),
          "x-mst-gateway-token": gatewayToken,
          "x-real-ip": "203.0.113.7",
        };
        delete headers["content-length"];
        delete headers.host;
        delete headers.cookie;
        // WebKit route interception drops binary bodies. This contract selects
        // exactly this owned CSV, whose retained bytes are checked below.
        const fileUpload =
          request.method() === "POST" &&
          /\/submissions\/[a-f0-9-]+\/files\/0$/.test(url.pathname);
        const response = await fetch(
          `http://127.0.0.1:${address.port}${url.pathname}`,
          {
            method: request.method(),
            headers,
            body:
              ((fileUpload
                ? csv
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
    await page.goto(root + "/tools/bom-check/?mst_analytics_test=1");
    expect(await page.locator("iframe").getAttribute("sandbox")).not.toContain(
      "allow-modals",
    );
    const tool = page.frameLocator("iframe"),
      panel = tool.getByRole("region", { name: "Private saved runs" });
    await tool.getByLabel("BOM CSV file", { exact: true }).setInputFiles({
      name: "owned-qa-55.csv",
      mimeType: "text/csv",
      buffer: csv,
    });
    await tool.getByRole("button", { name: /^Check BOM/ }).click();
    const receiptDownload = page.waitForEvent("download");
    await panel
      .getByRole("button", { name: "Download private receipt" })
      .click();
    const receiptPath = (await (await receiptDownload).path())!;
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    expect(receipt.origin).toBe(child);
    expect(receipt.tool).toBe("bom-check");
    const read = (suffix: string) =>
      fetch(
        `http://127.0.0.1:${address.port}/tools-api/v1/submissions/${receipt.id}${suffix}`,
        {
          headers: {
            "x-mst-gateway-token": gatewayToken,
            Origin: child,
            Authorization: `Bearer ${receipt.token}`,
          },
        },
      );
    expect(Buffer.from(await (await read("/files/0")).arrayBuffer())).toEqual(
      csv,
    );
    await page.reload();
    await panel
      .getByLabel("Private submission receipt")
      .setInputFiles(receiptPath);
    const remove = panel.getByRole("button", {
      name: "Delete this private record",
      exact: true,
    });
    await remove.click();
    const confirmation = panel.getByRole("group", {
      name: "Delete private record",
    });
    await expect(confirmation).toBeVisible();
    expect(deletes).toBe(0);
    expect((await read("/record")).status).toBe(200);
    const cancel = confirmation.getByRole("button", {
      name: "Cancel",
      exact: true,
    });
    await expect(cancel).toBeFocused();
    await cancel.press("Enter");
    await expect(confirmation).toHaveCount(0);
    await expect(remove).toBeFocused();
    expect(deletes).toBe(0);
    expect(Buffer.from(await (await read("/files/0")).arrayBuffer())).toEqual(
      csv,
    );
    await remove.click();
    await panel.getByRole("button", { name: "Open latest saved run" }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(remove).toBeEnabled();
    await remove.click();
    await page.screenshot({
      path: `.artifacts/${info.project.name}-us-delete-confirm.png`,
      fullPage: true,
    });
    await confirmation
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click();
    await expect(
      confirmation.getByRole("button", { name: "Deleting…", exact: true }),
    ).toBeDisabled();
    await expect(
      confirmation.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeDisabled();
    await expect.poll(() => deletes).toBe(1);
    releaseDelete!();
    await expect(panel.getByRole("alert")).toHaveText(
      "Synthetic deletion temporarily unavailable.",
    );
    expect(deletes).toBe(1);
    expect((await read("/record")).status).toBe(200);
    await expect(
      confirmation.getByRole("button", {
        name: "Delete permanently",
        exact: true,
      }),
    ).toBeEnabled();
    await confirmation
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click();
    await expect(
      panel.getByText("The private record and its attachments were deleted.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(deletes).toBe(2);
    await expect(remove).toHaveCount(0);
    expect((await read("/record")).status).toBe(404);
    expect((await read("/files/0")).status).toBe(404);
    await panel.getByRole("button", { name: "Open latest saved run" }).click();
    await expect(
      panel.getByText("This browser has no saved run for this tool.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  }
});
