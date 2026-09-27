import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { parseCsv } from "../src/csv";

test("register handoff detects all changes, exports, rejects duplicate keys and invalidates stale results", async ({
  page,
}, info) => {
  await page.goto("/tools/drawing-register-compare/");
  await page.getByRole("button", { name: "Try sample registers" }).click();
  await page
    .getByRole("button", { name: "Compare registers", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "1 added · 1 removed · 1 changed · 1 unchanged",
  );
  await expect(
    page.getByRole("region", { name: "Drawing register comparison" }),
  ).toContainText("DRW-300");
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export register differences" })
    .click();
  const rows = parseCsv(
    await readFile((await (await pending).path())!, "utf8"),
  );
  expect(
    rows.find((r) => r[0] === "DRW-100" && r[1] === "1")?.slice(2, 5),
  ).toEqual(["Changed", "A", "B"]);
  await mkdir(".artifacts", { recursive: true });
  await page.screenshot({
    path: `.artifacts/${info.project.name}-register.png`,
    fullPage: true,
  });
  const after = page.getByLabel("Paste after register");
  await after.fill((await after.inputValue()) + "\nDRW-300,1,A,Spacer");
  await expect(
    page.getByRole("button", { name: "Export register differences" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Compare registers", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("duplicate");
  await page.getByRole("button", { name: "Try sample registers" }).click();
  await page
    .getByRole("button", { name: "Compare registers", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("1 added");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("complete five-part BOM lab produces its independent expected differences and downloads a valid zip", async ({
  page,
  request,
}, info) => {
  await page.goto("/tools/drawing-to-bom/");
  await expect(
    page.getByRole("button", { name: "Try a sample" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Step-by-step guide and sample files" })
    .click();
  await expect(page).toHaveURL(/\/tools\/handbook\/#drawing-bom$/);
  await expect(
    page.getByRole("heading", {
      name: "1. A printed parts table should not require repeated retyping",
    }),
  ).toBeVisible();
  const bundle = await request.get(
    "/tools/labs/drawing-bom/drawing-bom-lab.zip",
  );
  expect(bundle.ok()).toBe(true);
  expect((await bundle.body()).subarray(0, 4)).toEqual(
    Buffer.from([0x50, 0x4b, 3, 4]),
  );
  await page.goto("/tools/bom-compare/");
  for (const [side, file] of [
    ["Before", "revision-a-reviewed.csv"],
    ["After", "revision-b.csv"],
  ]) {
    await page
      .getByLabel(`${side} CSV file`, { exact: true })
      .setInputFiles(`public/labs/drawing-bom/${file}`);
  }
  await page.getByRole("button", { name: "Compare BOMs" }).click();
  for (const label of ["Added 1", "Removed 1", "Changed 2", "Unchanged 2"])
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export comparison" }).click();
  const rows = parseCsv(
    await readFile((await (await pending).path())!, "utf8"),
  );
  expect(rows).toHaveLength(7);
  expect(rows.find((r) => r[1] === "SCR-M6")?.slice(0, 5)).toEqual([
    "Changed",
    "SCR-M6",
    "4",
    "6",
    "2",
  ]);
  expect(rows.find((r) => r[1] === "PIN-020")).toEqual(
    expect.arrayContaining(["Steel", "Stainless steel"]),
  );
  await mkdir(".artifacts", { recursive: true });
  await page.screenshot({
    path: `.artifacts/${info.project.name}-bom-lab.png`,
    fullPage: true,
  });
  await page.goto("/tools/handbook/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "checked engineering handoff",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
