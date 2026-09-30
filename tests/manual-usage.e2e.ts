import { test, expect, type Page } from "@playwright/test";
import { Resvg } from "@resvg/resvg-js";
import { readFile } from "node:fs/promises";
import { parseCsv } from "../src/csv";
import { isVisitRequest } from "./visit-request";

const origin = "https://mst-us.ai";
const drawing = new Resvg(
  '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500"><rect width="900" height="500" fill="white"/><text x="80" y="160" font-family="Arial" font-size="40">Practice illustration</text></svg>',
)
  .render()
  .asPng();

// The hosted origin exercises the real tracker, but every request is answered
// locally. These regressions must never write even QA records to production.
async function observe(page: Page) {
  const events: Record<string, unknown>[] = [];
  const errors: string[] = [];
  await page.context().route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (["data:", "blob:"].includes(url.protocol)) return route.continue();
    if (url.origin !== origin) {
      errors.push("Unexpected origin: " + url.origin);
      return route.abort();
    }
    if (request.method() === "POST") {
      expect(isVisitRequest(request)).toBe(true);
      events.push(request.postDataJSON());
      return route.fulfill({ status: 204 });
    }
    expect(request.method()).toBe("GET");
    const response = await fetch("http://127.0.0.1:4173" + url.pathname);
    return route.fulfill({
      status: response.status,
      contentType:
        response.headers.get("content-type") || "application/octet-stream",
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return {
    events,
    errors,
    usage: () => events.filter((event) => event.v === 2),
  };
}

async function exportCsv(page: Page, button: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: false }).click();
  const download = await pending;
  return parseCsv(await readFile((await download.path())!, "utf8"));
}

async function noLabels(
  page: Page,
  tool: "drawing-to-bom" | "title-block-reader" | "pid-tag-check",
) {
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "PRIVATE-illustration.png",
    mimeType: "image/png",
    buffer: drawing,
  });
  await expect(page.locator(".drawing-preview img")).toBeVisible();
  await page
    .getByRole("button", {
      name: tool === "drawing-to-bom" ? "Extract BOM" : "Read text",
    })
    .click();
  await expect(
    page.getByText(
      tool === "drawing-to-bom"
        ? /No recognizable BOM header found/
        : tool === "title-block-reader"
          ? /No recognizable title-block labels found/
          : /No matching printed tags found/,
    ),
  ).toBeVisible({ timeout: 100000 });
}

test("Drawing OCR zero rows can become a manual result without counting blank exports or reusing a prior source", async ({
  page,
}, info) => {
  const observed = await observe(page);
  await page.goto(origin + "/tools/drawing-to-bom/?mst_analytics_test=1");
  await noLabels(page, "drawing-to-bom");
  await expect.poll(() => observed.usage().length).toBe(1);
  const firstRun = observed.usage()[0].run_id;
  await page.getByRole("button", { name: "Add row" }).click();
  await exportCsv(page, "Export CSV");
  expect(observed.usage().map((event) => event.action)).toEqual(["tool_start"]);
  await page
    .getByLabel("Row 1 Part number", { exact: true })
    .fill("PRIVATE-PART");
  await page.getByLabel("Row 1 Quantity", { exact: true }).fill("2");
  const rows = await exportCsv(page, "Export CSV");
  expect(rows[1].slice(1, 4)).toEqual(["PRIVATE-PART", "", "2"]);
  await expect.poll(() => observed.usage().length).toBe(3);
  expect(observed.usage().map((event) => event.action)).toEqual([
    "tool_start",
    "tool_complete",
    "tool_export",
  ]);
  expect(
    observed
      .usage()
      .every((event) => event.run_id === firstRun && event.mode === "provided"),
  ).toBe(true);
  await exportCsv(page, "Export CSV");
  expect(observed.usage()).toHaveLength(3);

  // Choosing a new source clears the old attempt. Manual-only output receives
  // its own provided-input attempt instead of inheriting the earlier OCR run.
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "PRIVATE-next.png",
      mimeType: "image/png",
      buffer: drawing,
    });
  await expect(
    page.getByLabel("Row 1 Part number", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Add row" }).click();
  await page
    .getByLabel("Row 1 Part number", { exact: true })
    .fill("PRIVATE-NEXT");
  await page.getByLabel("Row 1 Quantity", { exact: true }).fill("3");
  await exportCsv(page, "Export CSV");
  await expect.poll(() => observed.usage().length).toBe(6);
  expect(
    new Set(
      observed
        .usage()
        .slice(3)
        .map((event) => event.run_id),
    ).size,
  ).toBe(1);
  expect(observed.usage()[3].run_id).not.toBe(firstRun);
  expect(JSON.stringify(observed.events)).not.toContain("PRIVATE");
  expect(observed.errors).toEqual([]);
  await info.attach("bounded-manual-events", {
    body: JSON.stringify(observed.events),
    contentType: "application/json",
  });
  await info.attach("manual-bom", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

test("Title manual review completes its own run and register export includes saved runs, not the latest unread result", async ({
  page,
}, info) => {
  const observed = await observe(page);
  await page.goto(origin + "/tools/title-block-reader/?mst_analytics_test=1");
  await noLabels(page, "title-block-reader");
  await expect.poll(() => observed.usage().length).toBe(1);
  const manualRun = observed.usage()[0].run_id;
  await page
    .getByLabel("Drawing number *", { exact: true })
    .fill("PRIVATE-DRAWING");
  await expect(
    page.getByRole("button", { name: "Add reviewed sheet" }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: "I checked these fields" }).check();
  await page.getByRole("button", { name: "Add reviewed sheet" }).click();
  await expect.poll(() => observed.usage().length).toBe(2);
  expect(observed.usage()[1]).toMatchObject({
    action: "tool_complete",
    run_id: manualRun,
    mode: "provided",
  });

  await page.getByRole("button", { name: "Try a sample", exact: true }).click();
  await page.getByRole("button", { name: "Read text" }).click();
  await expect(
    page.getByLabel("Drawing number *", { exact: true }),
  ).toHaveValue("DWG-7428", { timeout: 100000 });
  await page.getByRole("checkbox", { name: "I checked these fields" }).check();
  await page.getByRole("button", { name: "Add reviewed sheet" }).click();
  await expect.poll(() => observed.usage().length).toBe(4);
  const sampleRun = observed.usage()[2].run_id;

  await noLabels(page, "title-block-reader");
  await expect.poll(() => observed.usage().length).toBe(5);
  const unacceptedRun = observed.usage()[4].run_id;
  const rows = await exportCsv(page, "Export register");
  expect(rows).toHaveLength(3);
  expect(rows[1][2]).toBe("PRIVATE-DRAWING");
  await expect.poll(() => observed.usage().length).toBe(7);
  expect(observed.usage().slice(5)).toEqual([
    expect.objectContaining({
      action: "tool_export",
      run_id: manualRun,
      mode: "provided",
    }),
    expect.objectContaining({
      action: "tool_export",
      run_id: sampleRun,
      mode: "sample",
    }),
  ]);
  expect(
    observed.usage().filter((event) => event.run_id === unacceptedRun),
  ).toHaveLength(1);
  await exportCsv(page, "Export register");
  expect(observed.usage()).toHaveLength(7);
  expect(JSON.stringify(observed.events)).not.toContain("PRIVATE");
  expect(observed.errors).toEqual([]);
  await info.attach("bounded-register-events", {
    body: JSON.stringify(observed.events),
    contentType: "application/json",
  });
  await info.attach("manual-register", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

test("P&ID zero OCR tags retain explicit reviewed comparison and export phases", async ({
  page,
}, info) => {
  const observed = await observe(page);
  await page.goto(origin + "/tools/pid-tag-check/?mst_analytics_test=1");
  await noLabels(page, "pid-tag-check");
  expect(observed.usage()).toEqual([]);
  await page.getByLabel("Drawing tags", { exact: true }).fill("PT-999");
  await page.getByLabel("Reference tags", { exact: true }).fill("PT-999");
  await expect(
    page.getByRole("button", { name: "Compare tags" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "I checked the drawing tags" })
    .check();
  await page.getByRole("button", { name: "Compare tags" }).click();
  const rows = await exportCsv(page, "Export tag comparison");
  expect(rows[1].slice(0, 4)).toEqual(["PT-999", "Matched", "1", "1"]);
  await expect.poll(() => observed.usage().length).toBe(3);
  expect(observed.usage().map((event) => event.action)).toEqual([
    "tool_start",
    "tool_complete",
    "tool_export",
  ]);
  expect(new Set(observed.usage().map((event) => event.run_id)).size).toBe(1);
  expect(observed.usage().every((event) => event.mode === "provided")).toBe(
    true,
  );
  expect(JSON.stringify(observed.events)).not.toMatch(/PRIVATE|PT-999/);
  expect(observed.errors).toEqual([]);
  await info.attach("bounded-tag-events", {
    body: JSON.stringify(observed.events),
    contentType: "application/json",
  });
});

for (const exclusion of ["gpc", "dnt", "internal"])
  test(`Manual BOM export still works with ${exclusion} exclusion and emits no events`, async ({
    page,
  }) => {
    const observed = await observe(page);
    await page.addInitScript((kind) => {
      if (kind === "internal")
        localStorage.setItem("mst_internal_traffic", "1");
      else
        Object.defineProperty(
          navigator,
          kind === "gpc" ? "globalPrivacyControl" : "doNotTrack",
          { get: () => (kind === "gpc" ? true : "1") },
        );
    }, exclusion);
    await page.goto(origin + "/tools/drawing-to-bom/?mst_analytics_test=1");
    await page.getByRole("button", { name: "Add row" }).click();
    await page
      .getByLabel("Row 1 Part number", { exact: true })
      .fill("PRIVATE-PART");
    await page.getByLabel("Row 1 Quantity", { exact: true }).fill("2");
    expect((await exportCsv(page, "Export CSV"))[1][1]).toBe("PRIVATE-PART");
    expect(observed.events).toEqual([]);
    expect(observed.errors).toEqual([]);
  });
