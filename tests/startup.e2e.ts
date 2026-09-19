import { test, expect } from "@playwright/test";

test("all tool controls wait for hydration and the first action is retained", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const slug of [
    "drawing-to-bom",
    "bom-compare",
    "bom-check",
    "title-block-reader",
    "pid-tag-check",
  ]) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pattern = "**/tools/assets/index-*.js";
    await page.route(pattern, async (route) => {
      await gate;
      await route.continue();
    });
    try {
      await page.goto(`/tools/${slug}/`, { waitUntil: "commit" });
      const sample = page.getByRole("button", {
        name: slug === "bom-compare" ? "Try sample revisions" : "Try a sample",
        exact: true,
      });
      await expect(sample).toBeVisible();
      await expect(sample).toBeDisabled({ timeout: 1000 });
      await expect(
        page.getByRole("link", { name: "MST home", exact: true }),
      ).toHaveAttribute("href", "https://mst-us.ai/");
      release();
      await page.waitForLoadState("load");
      await expect(sample).toBeEnabled();
      await sample.click();
      if (slug === "bom-compare") {
        await expect(
          page.getByRole("button", { name: "Compare BOMs" }),
        ).toBeEnabled();
        await page.getByRole("button", { name: "Compare BOMs" }).click();
        await expect(
          page.getByRole("button", { name: "Changed 2", exact: true }),
        ).toBeVisible();
      } else if (slug === "bom-check") {
        await expect(
          page.getByLabel("BOM CSV text", { exact: true }),
        ).toHaveValue(/000417/);
        await expect(
          page.getByRole("button", { name: "Check BOM" }),
        ).toBeEnabled();
      } else await expect(page.locator(".drawing-preview img")).toBeVisible();
    } finally {
      release();
      await page.unroute(pattern);
    }
  }
  expect(errors).toEqual([]);
});
