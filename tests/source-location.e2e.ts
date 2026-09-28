import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parseCsv } from "../src/csv";
test("OCR locations remain in original-page coordinates after cropping and manual tags have no invented boxes", async ({
  page,
}) => {
  await page.goto("/tools/pid-tag-check/");
  await page.getByRole("button", { name: "Try a sample", exact: true }).click();
  await page.getByRole("button", { name: "Read text" }).click();
  await expect(page.getByLabel("Drawing tags", { exact: true })).toHaveValue(
    /PT-101/,
  );
  await page
    .getByRole("button", { name: "Locate PT-101 (2)", exact: true })
    .click();
  const boxes = () =>
    page.locator(".tag-location-box").evaluateAll((els) =>
      els
        .map((el) => {
          const s = (el as HTMLElement).style;
          return [
            parseFloat(s.left),
            parseFloat(s.top),
            parseFloat(s.width),
            parseFloat(s.height),
          ];
        })
        .sort((a, b) => a[1] - b[1]),
    );
  const before = await boxes();
  expect(before).toHaveLength(2);
  await page.getByText("Adjust crop with keyboard", { exact: true }).click();
  for (const [label, value] of [
    ["left (%)", "5"],
    ["top (%)", "5"],
    ["width (%)", "90"],
    ["height (%)", "90"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await expect(page.locator(".tag-location-box")).toHaveCount(0);
  await page.getByRole("button", { name: "Read text" }).click();
  await expect(page.getByLabel("Drawing tags", { exact: true })).toHaveValue(
    /PT-101/,
  );
  await page
    .getByRole("button", { name: "Locate PT-101 (2)", exact: true })
    .click();
  const after = await boxes();
  expect(after).toHaveLength(2);
  for (let i = 0; i < 2; i++)
    for (let n = 0; n < 4; n++)
      expect(Math.abs(before[i][n] - after[i][n])).toBeLessThan(1);
  await page.getByLabel("Drawing tags", { exact: true }).fill("TT-999");
  await page.getByLabel("Reference tags", { exact: true }).fill("TT-999");
  await page
    .getByRole("checkbox", { name: "I checked the drawing tags" })
    .check();
  await page.getByRole("button", { name: "Compare tags" }).click();
  await expect(
    page.getByRole("region", { name: "Tag comparison table" }),
  ).toContainText("No OCR location");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export tag comparison" }).click();
  const rows = parseCsv(
    await readFile((await (await pending).path())!, "utf8"),
  );
  expect(rows[1].slice(6)).toEqual(["0", ""]);
  await page
    .getByLabel("Drawing files", { exact: true })
    .setInputFiles("public/samples/pid-tags.png");
  await expect(page.locator(".tag-location-box")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Export tag comparison" }),
  ).toHaveCount(0);
});
