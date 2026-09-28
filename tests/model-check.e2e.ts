import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { parseCsv } from "../src/csv";

test("model handoff sample exposes discrepancies, locates evidence and exports every row", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/tools/bom-model-check/");
  await page.getByRole("button", { name: "Try handoff sample" }).click();
  await page.getByRole("button", { name: "Check model handoff" }).click();
  const table = page.getByRole("region", { name: "Model review table" });
  await expect(table).toContainText("No model mapping");
  await expect(table).toContainText("revision differs from BOM");
  await expect(table).toContainText("Multiple model mappings");
  await expect(table).toContainText("BOM revision not specified");
  await expect(page.getByRole("status")).toContainText(
    "File presence was not checked",
  );
  await page.getByRole("button", { name: "Model row 3", exact: true }).click();
  expect(
    await page
      .getByLabel("Model index CSV text")
      .evaluate((el: HTMLTextAreaElement) =>
        el.value.slice(el.selectionStart, el.selectionEnd),
      ),
  ).toBe("PIN-020,pin-old.step,0");
  await page
    .getByRole("button", { name: "Needs review 4", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export model review" }).click();
  const rows = parseCsv(
    await readFile((await (await pending).path())!, "utf8"),
  );
  expect(rows).toHaveLength(7);
  expect(rows.find((r) => r[1] === "BRK-100")?.slice(0, 8)).toEqual([
    "Metadata match",
    "BRK-100",
    "2",
    "2",
    "B",
    "B",
    "bracket-B.step",
    "Not checked",
  ]);
  expect(rows.find((r) => r[1] === "LEGACY-10")?.[0]).toBe("Not in BOM");
  await mkdir(".artifacts", { recursive: true });
  await page.screenshot({
    path: `.artifacts/${info.project.name}-model-check.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByLabel("BOM CSV text").fill('Part number,Revision\n"bad');
  await expect(
    page.getByRole("button", { name: "Export model review" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Check model handoff" }).click();
  await expect(page.getByRole("alert").last()).toBeVisible();
  expect(errors).toEqual([]);
});

test("selected files verify presence, retain unknown revisions and invalidate stale results", async ({
  page,
}) => {
  await page.goto("/tools/bom-model-check/");
  await page
    .getByLabel("BOM CSV text")
    .fill("Part number,Revision\n0001,A\n0002,B");
  await page
    .getByLabel("Model index CSV text")
    .fill("Part number,Revision,Model file\n0001,A,a.step\n0002,B,b.step");
  await page
    .getByLabel("Model files", { exact: true })
    .setInputFiles([
      {
        name: "a.step",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("synthetic presence fixture"),
      },
    ]);
  await page.getByRole("button", { name: "Check model handoff" }).click();
  const table = page.getByRole("region", { name: "Model review table" });
  await expect(
    table.getByRole("row").filter({ hasText: "0001" }),
  ).toContainText("Files matched");
  await expect(
    table.getByRole("row").filter({ hasText: "0002" }),
  ).toContainText("file not selected");
  await page.getByLabel("Model files", { exact: true }).setInputFiles([
    {
      name: "a.step",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("a"),
    },
    {
      name: "b.step",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("b"),
    },
  ]);
  await expect(
    page.getByRole("button", { name: "Export model review" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Check model handoff" }).click();
  await expect(
    page.getByRole("button", { name: "Files matched 2", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Model index Revision column").selectOption("-1");
  await page.getByRole("button", { name: "Check model handoff" }).click();
  await expect(
    page.getByRole("button", { name: "Needs review 2", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("BOM CSV text")).toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Export model review" }),
  ).toHaveCount(0);
});
