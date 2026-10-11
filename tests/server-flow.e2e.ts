import { test, expect } from "@playwright/test";

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
