import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";

test("server result survives reload, avoids browser model downloads, and can be deleted", async ({
  page,
}, info) => {
  const errors: string[] = [];
  let uploads = 0,
    modelRequests = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      /\/tools-api\/v1\/jobs\/[a-f0-9-]+$/.test(r.url())
    )
      uploads++;
    if (/\/vendor\/(lang|core)\//.test(r.url())) modelRequests++;
  });
  await page.route("**/vendor/lang/**", (r) => r.abort("connectionfailed"));
  await page.goto("/tools/drawing-to-bom/?mst_analytics_test=1");
  await expect(page.getByText("Processed on MST servers")).toBeVisible();
  await page.getByRole("button", { name: "Try a sample", exact: true }).click();
  await page.getByRole("button", { name: "Extract BOM", exact: true }).click();
  await expect(
    page.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveValue("BRK-100", { timeout: 60000 });
  await expect(
    page.getByRole("button", { name: "Delete server files" }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveValue("BRK-100", { timeout: 15000 });
  expect(uploads).toBe(1);
  expect(modelRequests).toBe(0);
  await page.evaluate(() => {
    (window as unknown as { restoredStarts: number }).restoredStarts = 0;
    window.MSTSiteVisits = {
      begin: () => {
        (window as unknown as { restoredStarts: number }).restoredStarts++;
        return { complete() {}, export() {} };
      },
    };
  });
  const downloaded = page.waitForEvent("download");
  const exported = page.waitForRequest((r) => r.url().endsWith("/exported"));
  await page.getByRole("button", { name: "Export CSV" }).click();
  await downloaded;
  await exported;
  expect(
    await page.evaluate(
      () => (window as unknown as { restoredStarts: number }).restoredStarts,
    ),
  ).toBe(0);
  await page.screenshot({
    path: `.artifacts/${info.project.name}-server-restored.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Delete server files" }).click();
  await expect(
    page.getByText(
      "Server files deleted. Any reviewed rows remain in this tab until you close it.",
    ),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("changing PDF page detaches the old result and submits the newly selected page", async ({
  page,
  baseURL,
}) => {
  const source = await PDFDocument.load(
    await readFile("public/samples/bracket-bom.pdf"),
  );
  const document = await PDFDocument.create();
  for (let i = 0; i < 2; i++)
    document.addPage((await document.copyPages(source, [0]))[0]);
  const uploads: { url: string; token: string; page: number }[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/jobs\/[a-f0-9-]+$/.test(request.url())
    )
      uploads.push({
        url: request.url(),
        token: request.headers().authorization,
        page: JSON.parse(request.headers()["x-mst-job-options"]).page,
      });
  });
  await page.goto("/tools/drawing-to-bom/?mst_analytics_test=1");
  await page.getByLabel("Choose a PNG, JPEG or PDF drawing").setInputFiles({
    name: "two-page-test.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await document.save()),
  });
  await page.getByRole("button", { name: "Extract BOM", exact: true }).click();
  await expect(
    page.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveValue("BRK-100", { timeout: 60000 });
  await page.getByLabel("PDF page").selectOption("2");
  await expect(
    page.getByRole("button", { name: "Extract BOM", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Check job again" }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => sessionStorage.getItem("mst_bom_job_v1")),
  ).toBeNull();
  await page.getByRole("button", { name: "Extract BOM", exact: true }).click();
  await expect(
    page.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveValue("BRK-100", { timeout: 60000 });
  expect(uploads.map((upload) => upload.page)).toEqual([1, 2]);
  await page.getByRole("button", { name: "Delete server files" }).click();
  await expect(
    page.getByRole("button", { name: "Delete server files" }),
  ).toHaveCount(0);
  const previous = await page.request.delete(uploads[0].url, {
    headers: {
      Authorization: uploads[0].token,
      Origin: new URL(baseURL!).origin,
    },
  });
  expect(previous.ok()).toBe(true);
});

test("unavailable upload gives a useful error promptly and a new attempt succeeds", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop-chromium",
    "Shared transport contract; successful flow also runs on mobile.",
  );
  await page.goto("/tools/drawing-to-bom/?mst_analytics_test=1");
  await page.getByRole("button", { name: "Try a sample", exact: true }).click();
  await page.route("**/tools-api/v1/jobs/*", async (route) => {
    if (route.request().method() === "POST")
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "unavailable",
          message:
            "The recognition service is temporarily unavailable. Please try again shortly.",
        }),
      });
    return route.continue();
  });
  const started = Date.now();
  await page.getByRole("button", { name: "Extract BOM", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  expect(Date.now() - started).toBeLessThan(5000);
  await expect(
    page.getByRole("button", { name: "Extract BOM", exact: true }),
  ).toBeEnabled();
  await page.unroute("**/tools-api/v1/jobs/*");
  await page.getByRole("button", { name: "Extract BOM", exact: true }).click();
  await expect(
    page.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveValue("BRK-100", { timeout: 60000 });
  await page.getByRole("button", { name: "Delete server files" }).click();
});

test("previous uploads and private receipts restore the right job after closing its tab", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop-chromium",
    "Private recovery contract; normal restoration also runs on mobile.",
  );
  await page.goto("/tools/drawing-to-bom/?mst_analytics_test=1");
  await page.getByLabel("Contact email (optional)").fill("qa@example.invalid");
  await page.getByRole("button", { name: "Try a sample", exact: true }).click();
  await page.getByRole("button", { name: "Extract BOM", exact: true }).click();
  await expect(
    page.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveValue("BRK-100");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save private job receipt" }).click();
  const receipt = (await (await download).path())!;
  const context = page.context();
  await page.close();
  const restored = await context.newPage();
  await restored.goto("/tools/drawing-to-bom/?mst_analytics_test=1");
  await expect(
    restored.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveValue("BRK-100");
  await restored
    .getByLabel("Choose a PNG, JPEG or PDF drawing")
    .setInputFiles({
      name: "different-B.png",
      mimeType: "image/png",
      buffer: await readFile("public/samples/bracket-bom.png"),
    });
  await expect(restored.locator(".drawing-preview img")).toBeVisible();
  await restored
    .getByText("Previous uploads and private receipts", { exact: true })
    .click();
  await restored
    .getByLabel("Saved upload in this browser")
    .selectOption({ index: 1 });
  await expect(
    restored.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveValue("BRK-100");
  await expect(restored.locator(".drawing-preview img")).toHaveCount(0);
  await restored.evaluate(() => localStorage.clear());
  await restored.reload();
  await expect(
    restored.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveCount(0);
  await restored
    .getByText("Previous uploads and private receipts", { exact: true })
    .click();
  await restored
    .getByLabel("Restore a private job receipt")
    .setInputFiles(receipt);
  await expect(
    restored.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveValue("BRK-100");
  await restored.getByRole("button", { name: "Delete server files" }).click();
  await expect(
    restored.getByRole("button", { name: "Delete server files" }),
  ).toHaveCount(0);
  await restored
    .getByLabel("Restore a private job receipt")
    .setInputFiles(receipt);
  await expect(restored.getByRole("alert")).toContainText("unavailable");
  await expect(
    restored.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveCount(0);
});
