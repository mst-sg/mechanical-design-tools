import { test, expect } from "@playwright/test";
import { isVisitRequest } from "./visit-request";
const origin = "https://mst-us.ai";
async function localOrigin(page: import("@playwright/test").Page) {
  if (process.env.MST_TOOLS_BASE_URL) return;
  await page.route(origin + "/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path.startsWith("/wp-json/mst-visits/")) {
      expect(isVisitRequest(request)).toBe(true);
      return route.fulfill({ status: 204 });
    }
    const response = await fetch("http://127.0.0.1:4173" + path);
    return route.fulfill({
      status: response.status,
      contentType:
        response.headers.get("content-type") || "application/octet-stream",
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
}
test("handbook PV and real compare-result-export phases, invalid input never completes", async ({
  page,
}) => {
  await localOrigin(page);
  const writes: Record<string, unknown>[] = [],
    errors: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") {
      expect(isVisitRequest(r)).toBe(true);
      writes.push(r.postDataJSON());
    }
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/tools/handbook/?mst_analytics_test=1");
  await expect.poll(() => writes.filter((x) => x.v === 1).length).toBe(1);
  await expect(page.locator("h1")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.goto(origin + "/tools/bom-compare/?mst_analytics_test=1");
  await page.getByRole("button", { name: "Try sample revisions" }).click();
  expect(writes.filter((x) => x.v === 2)).toHaveLength(0);
  await page.getByRole("button", { name: "Compare BOMs" }).click();
  await expect(
    page.getByRole("button", { name: "Changed 2", exact: true }),
  ).toBeVisible();
  await expect.poll(() => writes.filter((x) => x.v === 2).length).toBe(2);
  let pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export comparison" }).click();
  await pending;
  await expect.poll(() => writes.filter((x) => x.v === 2).length).toBe(3);
  pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export comparison" }).click();
  await pending;
  const usage = writes.filter((x) => x.v === 2);
  expect(usage.map((x) => x.action)).toEqual([
    "tool_start",
    "tool_complete",
    "tool_export",
  ]);
  expect(new Set(usage.map((x) => x.run_id)).size).toBe(1);
  expect(usage.every((x) => x.mode === "sample" && x.traffic === "test")).toBe(
    true,
  );
  await page
    .getByLabel("After CSV text")
    .fill("Part number,Quantity\nPRIVATE-PART,1\nPRIVATE-PART,2");
  await page.getByRole("button", { name: "Compare BOMs" }).click();
  await expect(page.getByRole("alert")).toContainText("duplicate");
  await expect.poll(() => writes.filter((x) => x.v === 2).length).toBe(4);
  expect(writes.at(-1)).toMatchObject({
    action: "tool_start",
    mode: "provided",
  });
  expect(JSON.stringify(writes)).not.toContain("PRIVATE-PART");
  expect(errors).toEqual([]);
});
test("privacy exclusion also suppresses real tool phases", async ({ page }) => {
  await localOrigin(page);
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") writes.push(r.url());
  });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "globalPrivacyControl", {
      get: () => true,
    }),
  );
  await page.goto(origin + "/tools/bom-compare/?mst_analytics_test=1");
  await page.getByRole("button", { name: "Try sample revisions" }).click();
  await page.getByRole("button", { name: "Compare BOMs" }).click();
  await expect(
    page.getByRole("button", { name: "Changed 2", exact: true }),
  ).toBeVisible();
  expect(writes).toEqual([]);
});

for (const [tool, sampleButton, runButton, exportButton] of [
  ["bom-model-check", "Try handoff sample", "Check model handoff", "Export model review"],
  ["connection-table-check", "Try faulty sample", "Check connection table", "Export connection review"],
]) test(`${tool} reports only bounded start, complete and export events`, async ({
  page,
}) => {
  await localOrigin(page);
  const events: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") {
      expect(isVisitRequest(r)).toBe(true);
      events.push(r.postDataJSON());
    }
  });
  await page.goto(origin + `/tools/${tool}/?mst_analytics_test=1`);
  await page.getByRole("button", { name: sampleButton }).click();
  await page.getByRole("button", { name: runButton }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: exportButton }).click();
  await pending;
  await expect.poll(() => events.filter((x) => x.v === 2).length).toBe(3);
  expect(events.filter((x) => x.v === 2).map((x) => x.action)).toEqual([
    "tool_start",
    "tool_complete",
    "tool_export",
  ]);
  expect(
    events
      .filter((x) => x.v === 2)
      .every(
        (x) =>
          x.tool === tool &&
          x.traffic === "test" &&
          x.mode === "sample",
      ),
  ).toBe(true);
  expect(JSON.stringify(events)).not.toMatch(/BRK-100|bracket-B|F-999|V-101/);
});
