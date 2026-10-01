import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { parseCsv } from "../src/csv";
import { isVisitRequest } from "./visit-request";

for (const kind of ["line", "package"] as const)
  test(`${kind} review: sample, source record, reviewed export, correction and invalidation`, async ({
    page,
  }, info) => {
    const errors: string[] = [],
      writes: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (!["GET", "HEAD"].includes(r.method())) {
        expect(isVisitRequest(r)).toBe(true);
        writes.push(r.postData() || "");
      }
    });
    const line = kind === "line",
      slug = line ? "line-list-check" : "delivery-package-check";
    const began = Date.now();
    await page.goto(`/tools/${slug}/?mst_analytics_test=1`);
    await expect(
      page.getByRole("button", { name: "Try faulty sample" }),
    ).toBeEnabled();
    expect(Date.now() - began).toBeLessThan(
      process.env.MST_TOOLS_BASE_URL ? 5000 : 3000,
    );
    await page.getByRole("button", { name: "Try faulty sample" }).click();
    const run = page.getByRole("button", {
      name: line ? "Check line lists" : "Check delivery package",
    });
    const started = Date.now();
    await run.click();
    await expect(page.getByRole("status")).toContainText(
      `${line ? 4 : 3} review items`,
    );
    expect(Date.now() - started).toBeLessThan(1000);
    const exp = page.getByRole("button", {
      name: line ? "Export line list review" : "Export package review",
    });
    await expect(exp).toBeDisabled();
    await page
      .getByRole("button", {
        name: line ? "Line list record 2" : "Manifest record 3",
        exact: true,
      })
      .click();
    const field = page.getByLabel(
      line ? "Line list CSV text" : "Manifest CSV text",
      { exact: true },
    );
    const selected = await field.evaluate((el: HTMLTextAreaElement) =>
      el.value.slice(el.selectionStart, el.selectionEnd),
    );
    expect(selected).toContain(line ? "L-001,TK-100" : "bracket-B.step");
    await page.getByRole("checkbox", { name: /I have reviewed/ }).check();
    const pending = page.waitForEvent("download");
    await exp.click();
    const download = await pending;
    const csv = parseCsv(await readFile((await download.path())!, "utf8"));
    expect(csv.length).toBe(line ? 5 : 4);
    expect(csv.slice(1).map((r) => r[line ? 5 : 2])).toEqual(
      line
        ? [
            "attribute-differs",
            "attribute-differs",
            "absent-from-drawing-records",
            "absent-from-line-list",
          ]
        : ["empty-file", "missing-file", "not-in-manifest"],
    );
    await mkdir(".artifacts", { recursive: true });
    await page
      .locator(".diff-results")
      .screenshot({
        path: `.artifacts/${info.project.name}-${slug}-faulty.png`,
      });
    await page.screenshot({
      path: `.artifacts/${info.project.name}-${slug}-page.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Load corrected sample" }).click();
    await expect(exp).toHaveCount(0);
    await run.click();
    await expect(page.getByRole("status")).toContainText("0 review items");
    await expect(exp).toBeDisabled();
    await page
      .locator(".diff-results")
      .screenshot({
        path: `.artifacts/${info.project.name}-${slug}-corrected.png`,
      });
    await field.fill('Unknown\n"broken');
    await expect(exp).toHaveCount(0);
    await run.click();
    await expect(page.getByRole("alert").last()).toBeVisible();
    await page.getByRole("button", { name: "Clear inputs" }).click();
    await expect(run).toBeDisabled();
    await page.reload();
    await expect(field).toBeEmpty();
    expect(errors).toEqual([]);
    expect(writes.join("\n")).not.toMatch(/L-001|bracket-B|PT-999/);
  });

test("provided line files require symmetric mapping and reject an oversized replacement", async ({
  page,
}) => {
  await page.goto("/tools/line-list-check/?mst_analytics_test=1");
  await page
    .getByLabel("Line list CSV file", { exact: true })
    .setInputFiles({
      name: "private.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Line,Size\n001,DN25"),
    });
  await page.getByLabel("Reviewed drawing records CSV text").fill("Line\n001");
  await page.getByRole("button", { name: "Check line lists" }).click();
  await expect(page.getByRole("alert").last()).toContainText(
    "Map Size in both",
  );
  await page
    .getByLabel("Line list Size column", { exact: true })
    .selectOption("-1");
  await page.getByRole("button", { name: "Check line lists" }).click();
  await expect(page.getByRole("status")).toContainText("0 review items");
  await expect(page.getByText(/none \(identity only\)/)).toBeVisible();
  await page
    .getByLabel("Line list CSV file", { exact: true })
    .setInputFiles({
      name: "oversized.csv",
      mimeType: "text/csv",
      buffer: Buffer.alloc(4 * 1024 * 1024 + 1, 65),
    });
  await expect(
    page.getByLabel("Line list CSV text", { exact: true }),
  ).toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Export line list review" }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert").last()).toBeVisible();
});

test("actual selected delivery files use metadata and clear a prior sample result", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) {
      expect(isVisitRequest(r)).toBe(true);
      writes.push(r.postData() || "");
    }
  });
  await page.goto("/tools/delivery-package-check/?mst_analytics_test=1");
  await page.getByRole("button", { name: "Load corrected sample" }).click();
  await page.getByRole("button", { name: "Check delivery package" }).click();
  await page
    .getByLabel("Manifest CSV text")
    .fill("File\nprivate-model.step\nmissing.pdf");
  await page
    .getByLabel("Package files", { exact: true })
    .setInputFiles([
      {
        name: "private-model.step",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("PRIVATE-CONTENT-NOT-FOR-UPLOAD"),
      },
    ]);
  await page.getByRole("button", { name: "Check delivery package" }).click();
  await expect(page.getByRole("status")).toContainText(
    "1 uniquely matched non-empty files · 1 review items",
  );
  await expect(
    page.getByRole("region", { name: "Delivery package review table" }),
  ).toContainText("missing.pdf");
  await page
    .getByLabel("Package files", { exact: true })
    .setInputFiles([
      {
        name: "private-model.step",
        mimeType: "application/octet-stream",
        buffer: Buffer.alloc(0),
      },
    ]);
  await expect(
    page.getByRole("button", { name: "Export package review" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Check delivery package" }).click();
  await expect(page.getByRole("status")).toContainText(
    "0 uniquely matched non-empty files · 2 review items",
  );
  expect(writes.join("\n")).not.toMatch(
    /PRIVATE-CONTENT|private-model|missing\.pdf/,
  );
});
