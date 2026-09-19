import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { parseCsv } from "../src/csv";
function watch(page: Page) {
  const origin = new URL(
    process.env.MST_TOOLS_BASE_URL || "http://127.0.0.1:4173",
  ).origin;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => {
    if (
      !r.url().startsWith(origin + "/") &&
      !r.url().startsWith("blob:") &&
      !r.url().startsWith("data:")
    )
      errors.push("Unexpected egress: " + r.url());
    if (r.method() !== "GET") errors.push("Unexpected write: " + r.method());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(r.status() + " " + r.url());
  });
  return errors;
}
async function noOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    body: document.body.scrollWidth,
    visual: window.visualViewport?.width,
    panels: [...document.querySelectorAll(".panel,.shell")].map((e) => ({
      class: e.className,
      width: e.getBoundingClientRect().width,
      right: e.getBoundingClientRect().right,
      scroll: e.scrollWidth,
    })),
  }));
  expect(sizes.document <= sizes.viewport + 1, JSON.stringify(sizes)).toBe(
    true,
  );
}
test("on-site directory, dropdown, mapping, comparison, download and invalid input", async ({
  page,
}, info) => {
  const errors = watch(page);
  const started = Date.now();
  await page.goto("/tools/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Small tools",
  );
  expect(Date.now() - started).toBeLessThan(
    process.env.MST_TOOLS_BASE_URL ? 10000 : 5000,
  );
  await page.locator("header summary").click();
  await page
    .locator("header")
    .getByRole("link", { name: "BOM Compare", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tools\/bom-compare\//);
  await page.getByRole("button", { name: "Try sample revisions" }).click();
  await page.getByRole("button", { name: "Compare BOMs" }).click();
  await expect(
    page.getByRole("button", { name: "Added 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Removed 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Changed 2", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Unchanged 1", exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await mkdir(".artifacts", { recursive: true });
  await page.screenshot({
    path: `.artifacts/${info.project.name}-compare.png`,
    fullPage: true,
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export comparison" }).click();
  const csv = parseCsv(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(csv.find((r) => r[1] === "SCR-M6")?.slice(0, 5)).toEqual([
    "Changed",
    "SCR-M6",
    "4",
    "6",
    "2",
  ]);
  await page
    .getByLabel("After CSV text", { exact: true })
    .fill("Part number,Qty\nA,1\nA,2");
  await page.getByRole("button", { name: "Compare BOMs" }).click();
  await expect(page.getByRole("alert")).toContainText("duplicate");
  await page
    .getByLabel("After CSV text", { exact: true })
    .fill('Part number,Qty\nA,"bad');
  await expect(page.getByRole("alert")).toContainText("unclosed");
  expect(errors).toEqual([]);
});
test("real PNG recognition, row correction and CSV export without upload", async ({
  page,
}, info) => {
  const errors = watch(page);
  await page.goto("/tools/drawing-to-bom/");
  await expect(
    page.getByRole("button", { name: "Extract BOM" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Try a sample", exact: true }).click();
  await expect(page.locator(".drawing-preview img")).toBeVisible();
  await page.getByRole("button", { name: "Extract BOM" }).click();
  await expect(
    page.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveValue("BRK-100", { timeout: 100000 });
  await expect(
    page.getByLabel("Row 5 Part number", { exact: true }),
  ).toHaveValue("NUT-M6");
  await expect(page.getByLabel("Row 3 Quantity", { exact: true })).toHaveValue(
    "4",
  );
  await page.getByLabel("Row 3 Quantity", { exact: true }).fill("6");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const csv = parseCsv(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(csv).toHaveLength(6);
  expect(csv[3][3]).toBe("6");
  await noOverflow(page);
  await page.screenshot({
    path: `.artifacts/${info.project.name}-drawing.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("user image/PDF paths and unsupported file recovery", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop-chromium",
    "File decoder coverage on desktop; primary flows cross-browser above.",
  );
  const errors = watch(page);
  await page.goto("/tools/drawing-to-bom/");
  const input = page.locator("input[type=file]");
  await input.setInputFiles({
    name: "wrong.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a drawing"),
  });
  await expect(page.getByRole("alert")).toContainText("PNG, JPEG or PDF");
  await input.setInputFiles("public/samples/bracket-bom.pdf");
  await expect(page.getByLabel("PDF page")).toHaveValue("1");
  await expect(page.locator(".drawing-preview img")).toBeVisible();
  await page.getByText("Adjust crop with keyboard").click();
  await page.getByLabel("left (%)", { exact: true }).fill("3");
  await page.getByLabel("top (%)", { exact: true }).fill("50");
  await page.getByLabel("width (%)", { exact: true }).fill("94");
  await page.getByLabel("height (%)", { exact: true }).fill("42");
  await page.getByRole("button", { name: "Extract BOM" }).click();
  await expect(
    page.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveValue("BRK-100", { timeout: 100000 });
  await expect(page.getByLabel("Row 5 Quantity", { exact: true })).toHaveValue(
    "4",
  );
  expect(errors).toEqual([]);
});
test("canonical HTML and useful tool content without JavaScript", async ({
  browser,
}, info) => {
  test.skip(info.project.name !== "desktop-chromium");
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const slug of ["", "drawing-to-bom/", "bom-compare/"]) {
    const response = await page.goto(
      (process.env.MST_TOOLS_BASE_URL || "http://127.0.0.1:4173") +
        "/tools/" +
        slug,
    );
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("link[rel=canonical]")).toHaveAttribute(
      "href",
      "https://mst-us.ai/tools/" + slug,
    );
    await expect(page.locator("main")).toContainText(
      slug ? "CSV" : "Small tools",
    );
  }
  await context.close();
});

test("cancel model initialization and recover using the sample", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop-chromium");
  await page.goto("/tools/drawing-to-bom/");
  await page.getByRole("button", { name: "Try a sample", exact: true }).click();
  await page.getByRole("button", { name: "Extract BOM" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByText("Recognition cancelled. Your drawing is still here."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Extract BOM" })).toBeEnabled();
  await page.getByRole("button", { name: "Extract BOM" }).click();
  await expect(
    page.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveValue("BRK-100", { timeout: 60000 });
});
