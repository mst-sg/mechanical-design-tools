import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";

function readWorkbook(
  path: string,
): Record<string, Record<string, string | number>> {
  return JSON.parse(
    execFileSync("python3", ["tests/fixtures/read-xlsx.py", path], {
      encoding: "utf8",
    }),
  );
}

test("edited Excel matches the submitted source after recropping and reports missing provenance after reload", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tools/drawing-to-bom/?mst_analytics_test=1");
  await page.getByRole("button", { name: "Try a sample", exact: true }).click();
  await page.getByRole("button", { name: "Extract BOM", exact: true }).click();
  await expect(
    page.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveValue("BRK-100", { timeout: 60000 });
  await page.getByLabel("Row 1 Part number", { exact: true }).fill("000007");
  await page.getByLabel("Row 1 Description", { exact: true }).fill("=1+1");
  await page.getByLabel("Row 1 Quantity", { exact: true }).fill("2.5");
  await page.getByRole("button", { name: "Use whole page" }).click();
  const event = page.waitForResponse(
    (r) => r.url().endsWith("/exported") && r.request().method() === "POST",
  );
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("bom-draft.xlsx");
  expect((await event).ok()).toBe(true);
  const path = `.artifacts/${info.project.name}-bom-draft.xlsx`;
  await download.saveAs(path);
  const workbook = readWorkbook(path);
  expect(workbook.BOM.B2).toBe("000007");
  expect(workbook.BOM.C2).toBe("=1+1");
  expect(workbook.BOM.D2).toBe(2.5);
  expect(workbook["Source and review"].B5).toBe(
    "Left 3, top 50, width 94, height 42",
  );
  await page.screenshot({
    path: `.artifacts/${info.project.name}-bom-excel.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveValue("BRK-100");
  const restoredDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel" }).click();
  const restored = readWorkbook((await (await restoredDownload).path())!);
  expect(restored["Source and review"].B4).toBe(
    "Not available in this browser",
  );
  expect(restored["Source and review"].B5).toBe(
    "Not available in this browser",
  );
  await page.getByRole("button", { name: "Delete server files" }).click();
  expect(errors).toEqual([]);
});

test("failed Excel export preserves rows, shows a useful error and does not record an export", async ({
  page,
}) => {
  const exports: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/exported")) exports.push(r.url());
  });
  await page.goto("/tools/drawing-to-bom/?mst_analytics_test=1");
  await page.getByRole("button", { name: "Add row" }).click();
  await page.getByLabel("Row 1 Part number", { exact: true }).fill("TOO-LONG");
  await page
    .getByLabel("Row 1 Description", { exact: true })
    .fill("x".repeat(32768));
  await page.getByRole("button", { name: "Export Excel" }).click();
  await expect(page.getByRole("alert")).toContainText("32,767");
  await expect(
    page.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveValue("TOO-LONG");
  expect(exports).toEqual([]);
  await page.getByLabel("Row 1 Description", { exact: true }).fill("Corrected");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel" }).click();
  await downloaded;
  await expect(page.getByRole("alert")).toHaveCount(0);
});
