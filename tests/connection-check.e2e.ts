import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { parseCsv } from "../src/csv";
import { isVisitRequest } from "./visit-request";

test("a connection exercise produces source evidence, export and a corrected result", async ({ page }, info) => {
  const errors: string[] = [], writes: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.method() !== "GET" && r.method() !== "HEAD") {
      expect(isVisitRequest(r)).toBe(true);
      writes.push(r.postData() || "");
    }
  });
  const started = Date.now();
  await page.goto("/tools/connection-table-check/?mst_analytics_test=1");
  await expect(page.getByRole("button", { name: "Try faulty sample" })).toBeEnabled();
  expect(Date.now() - started).toBeLessThan(process.env.MST_TOOLS_BASE_URL ? 5000 : 3000);
  await page.getByRole("button", { name: "Try faulty sample" }).click();
  const checking = Date.now();
  await page.getByRole("button", { name: "Check connection table" }).click();
  await expect(page.getByRole("status")).toContainText("5 connection records · 5 reviewed tags · 12 review items");
  expect(Date.now() - checking).toBeLessThan(1000);
  await page.getByRole("button", { name: "BOM assignments record 2", exact: true }).click();
  expect(await page.getByLabel("BOM assignments CSV text").evaluate((e: HTMLTextAreaElement) => e.value.slice(e.selectionStart, e.selectionEnd))).toBe("V-101,");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export connection review" }).click();
  const downloaded = await pending;
  const csv = parseCsv(await readFile((await downloaded.path())!, "utf8"));
  const expected = JSON.parse(await readFile("public/labs/connection-check/expected-findings.json", "utf8"));
  const names: Record<string, string> = { connections: "Connections", tags: "Reviewed tags", bom: "BOM assignments" };
  expect(csv.slice(1).map((r) => r.slice(0, 3))).toEqual(expected.map(([source, row, code]: [string, number, string]) => [names[source], String(row), code]));
  expect(csv.slice(1).every((r) => r[8] === "Yes")).toBe(true);
  await mkdir(".artifacts", { recursive: true });
  await downloaded.saveAs(`.artifacts/${info.project.name}-connection-review.csv`);
  await page.getByRole("heading", { name: "Connection review", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `.artifacts/${info.project.name}-connection-check.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole("button", { name: "Load corrected sample" }).click();
  await expect(page.getByRole("button", { name: "Export connection review" })).toHaveCount(0);
  await page.getByRole("button", { name: "Check connection table" }).click();
  await expect(page.getByRole("status")).toContainText("0 review items. BOM assignments checked.");
  await expect(page.getByText("No discrepancies found in the supplied lists.", { exact: true })).toBeVisible();
  await page.getByLabel("BOM assignments CSV text").fill("");
  await page.getByRole("button", { name: "Check connection table" }).click();
  await expect(page.getByRole("status")).toContainText("BOM assignments not checked.");
  await page.reload();
  await expect(page.getByLabel("Connections CSV text")).toBeEmpty();
  await expect(page.getByRole("button", { name: "Export connection review" })).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(writes.join("\n")).not.toMatch(/V-101|F-999|VALVE-100/);
});

test("uploaded records, manual mapping and bad-input recovery use the current input", async ({ page }) => {
  await page.goto("/tools/connection-table-check/?mst_analytics_test=1");
  await page.getByLabel("Connections CSV file", { exact: true }).setInputFiles({ name: "private.csv", mimeType: "text/csv", buffer: Buffer.from("source,destination\n0001,0002") });
  await page.getByLabel("Reviewed tags CSV text").fill("Tag\n0001\n0002");
  await page.getByLabel("Connections From tag column").selectOption("0");
  await page.getByLabel("Connections To tag column").selectOption("1");
  await page.getByRole("button", { name: "Check connection table" }).click();
  await expect(page.getByRole("status")).toContainText("0 review items");
  await page.getByLabel("Connections CSV text").fill("From tag,To tag\n0001,PRIVATE-UNLISTED");
  await expect(page.getByRole("button", { name: "Export connection review" })).toHaveCount(0);
  await page.getByRole("button", { name: "Check connection table" }).click();
  const table = page.getByRole("region", { name: "Connection review table" });
  await expect(table).toContainText("PRIVATE-UNLISTED");
  await expect(table).toContainText("unknown-endpoint");
  await page.getByLabel("Reviewed tags CSV text").fill("Tag\n0001\n0001");
  await page.getByRole("button", { name: "Check connection table" }).click();
  await expect(page.getByRole("alert").last()).toContainText("duplicate 0001");
  await expect(page.getByRole("button", { name: "Export connection review" })).toHaveCount(0);
  await page.getByLabel("Connections CSV text").fill('From tag,To tag\n"bad');
  await page.getByRole("button", { name: "Check connection table" }).click();
  await expect(page.getByRole("alert").last()).toBeVisible();
  await page.getByRole("button", { name: "Load corrected sample" }).click();
  await page.getByRole("button", { name: "Check connection table" }).click();
  await expect(page.getByRole("status")).toContainText("0 review items");
  await page.getByRole("button", { name: "Clear inputs" }).click();
  await expect(page.getByLabel("Connections CSV text")).toBeEmpty();
  await expect(page.getByRole("button", { name: "Check connection table" })).toBeDisabled();
});

test("the handbook links downloadable exercises to working checkers", async ({ page }) => {
  await page.goto("/tools/handbook/?mst_analytics_test=1#connections");
  await expect(page.locator("#connections")).toBeVisible();
  for (const asset of [
    "connection-check/connection-review-illustration.webp",
    "connection-check/review-result.png",
    "connection-check/review-corrected.png",
    "model-handoff/model-reference-illustration.webp",
    "model-handoff/review-before.png",
    "model-handoff/review-after.png",
  ]) {
    const img = page.locator(`img[src="/tools/labs/${asset}"]`);
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await expect(img).toHaveAttribute("alt", /.+/);
    await expect(img.locator("..")).toHaveAttribute("href", /\.png$/);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const pending = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download the complete connection exercise" }).click();
  const download = await pending;
  expect((await readFile((await download.path())!)).subarray(0, 2).toString()).toBe("PK");
  await page.getByRole("link", { name: "Connection Table Check", exact: true }).click();
  await expect(page.getByRole("button", { name: "Try faulty sample" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "How to prepare a P&ID connection table" })).toHaveAttribute("href", "/how-to-read-a-pid/#connection-table-check");
  await page.goto("/tools/bom-model-check/?mst_analytics_test=1");
  await page.getByLabel("BOM CSV file", { exact: true }).setInputFiles("public/labs/model-handoff/bom-corrected.csv");
  await page.getByLabel("Model index CSV file", { exact: true }).setInputFiles("public/labs/model-handoff/model-index-corrected.csv");
  await page.getByRole("button", { name: "Check model handoff" }).click();
  await expect(page.getByRole("button", { name: "Metadata match 5", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("File presence was not checked");
});
