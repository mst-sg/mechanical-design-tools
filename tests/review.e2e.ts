import { test, expect, type Page } from "@playwright/test";
import { Resvg } from "@resvg/resvg-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseCsv } from "../src/csv";
const origin = new URL(
  process.env.MST_TOOLS_BASE_URL || "http://127.0.0.1:4173",
).origin;
function watch(page: Page, ocrDiagnostics?: string[], allowCancel = false) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // Tesseract can attempt tiny line/symbol fragments as text. Preserve these
    // reviewed WASM diagnostics in evidence; all tag values are asserted below.
    if (
      ocrDiagnostics &&
      (/^Image too small to scale!! \(\d+x\d+ vs min width of 3\)$/.test(
        text,
      ) ||
        text === "Line cannot be recognized!!")
    )
      ocrDiagnostics.push(text);
    else errors.push(text);
  });
  page.on("request", (r) => {
    if (
      !r.url().startsWith("blob:") &&
      !r.url().startsWith("data:") &&
      new URL(r.url()).origin !== origin
    )
      errors.push("Unexpected egress: " + r.url());
    if (r.method() !== "GET") errors.push("Unexpected write: " + r.method());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(r.status() + " " + r.url());
  });
  page.on("requestfailed", (r) => {
    const reason = r.failure()?.errorText || "Unknown request failure";
    if (allowCancel && /aborted|cancelled|canceled/i.test(reason)) return;
    errors.push(reason + " " + r.url());
  });
  return errors;
}
async function openTool(page: Page, path: string) {
  const started = Date.now();
  expect((await page.goto(path))?.status()).toBe(200);
  await expect(page.locator("h1")).toBeVisible();
  // setInputFiles is programmatic and does not wait for an enabled control.
  await expect(page.locator(".tool-body")).toBeEnabled();
  expect(Date.now() - started).toBeLessThan(
    process.env.MST_TOOLS_BASE_URL ? 10000 : 5000,
  );
}
async function screenshot(page: Page, name: string) {
  await mkdir(".artifacts", { recursive: true });
  await page.screenshot({ path: `.artifacts/${name}.png`, fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}
async function png(name: string, replacements: [string, string][]) {
  let svg = await readFile(`public/samples/${name}.svg`, "utf8");
  for (const [from, to] of replacements) svg = svg.replaceAll(from, to);
  const image = new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontFiles: [
        "node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf",
      ],
      defaultFontFamily: "Liberation Sans",
    },
  })
    .render()
    .asPng();
  await mkdir(".artifacts/inputs", { recursive: true });
  await writeFile(`.artifacts/inputs/new-${name}.png`, image);
  return image;
}
async function exported(page: Page, button: string) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: button }).click();
  const csv = await readFile((await (await event).path())!, "utf8");
  await mkdir(".artifacts/downloads", { recursive: true });
  const info = test.info();
  const name = `${info.project.name}-${info.title}-${button}`.replace(
    /[^a-z0-9-]/gi,
    "-",
  );
  await writeFile(`.artifacts/downloads/${name}.csv`, csv);
  return parseCsv(csv);
}

test("BOM check preserves custom columns, detects conflicts, edits, previews merge and exports", async ({
  page,
}, info) => {
  const errors = watch(page);
  await openTool(page, "/tools/bom-check/");
  const input =
    "Item,Part number,Description,Quantity,Material,Unit,Revision\n1,000982,Spacer,0.1,Steel,ea,C\n2,000982,Spacer,0.2,Steel,ea,C\n3,VAL-73,Valve,2,Steel,ea,A\n4,VAL-73,Valve,2,Steel,m,A\n5,,Seal,3,Rubber,ea,A\n6,PIN-94,Pin,,Steel,ea,A";
  await page.getByLabel("BOM CSV file", { exact: true }).setInputFiles({
    name: "fresh-review.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(input),
  });
  let t = Date.now();
  await page.getByRole("button", { name: "Check BOM" }).click();
  await expect(
    page.getByRole("heading", { name: "6 rows to review" }),
  ).toBeVisible();
  expect(Date.now() - t).toBeLessThan(2000);
  await page
    .getByLabel("Source row 5 Part number", { exact: true })
    .fill("SEAL-95");
  await page.getByLabel("Source row 6 Quantity", { exact: true }).fill("4");
  await page.getByText("Review repeated part numbers", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Review combine VAL-73", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Review combine 000982", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Combine preview" }),
  ).toContainText("0.3");
  await page
    .getByRole("button", { name: "Confirm combine", exact: true })
    .click();
  await expect(
    page.getByLabel("Source row 1 Quantity", { exact: true }),
  ).toHaveValue("0.3");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("Source row 1 Quantity", { exact: true }),
  ).toHaveValue("0.1");
  await page
    .getByRole("button", { name: "Review combine 000982", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm combine", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "I reviewed the current rows" })
    .check();
  const output = await exported(page, "Export reviewed CSV");
  expect(output).toHaveLength(6);
  expect(output[0]).toEqual([
    "Item",
    "Part number",
    "Description",
    "Quantity",
    "Material",
    "Unit",
    "Revision",
  ]);
  expect(output[1]).toEqual([
    "1",
    "000982",
    "Spacer",
    "0.3",
    "Steel",
    "ea",
    "C",
  ]);
  expect(output.at(-1)).toEqual([
    "6",
    "PIN-94",
    "Pin",
    "4",
    "Steel",
    "ea",
    "A",
  ]);
  const report = await exported(page, "Export check report");
  expect(report.filter((r) => r[2] === "Conflicting part number")).toHaveLength(
    2,
  );
  await screenshot(page, `${info.project.name}-bom-check`);
  await page
    .getByLabel("BOM CSV text", { exact: true })
    .fill('Part number,Qty\n"broken,1');
  await page.getByRole("button", { name: "Check BOM" }).click();
  await expect(page.getByRole("alert")).toContainText("unclosed");
  expect(errors).toEqual([]);
});

test("title reader runs new-image OCR, reviews fields and exports a drawing register", async ({
  page,
}, info) => {
  const errors = watch(page);
  await openTool(page, "/tools/title-block-reader/");
  const buffer = await png("title-block", [
    ["DWG-7428", "DRW-8625"],
    ["MOUNTING BASE", "PUMP SUPPORT"],
    [">B<", ">D<"],
  ]);
  await page.getByLabel("Drawing files", { exact: true }).setInputFiles({
    name: "fresh-pump-support.png",
    mimeType: "image/png",
    buffer,
  });
  await expect(page.locator(".drawing-preview img")).toBeVisible();
  const t = Date.now();
  await page.getByRole("button", { name: "Read text" }).click();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeVisible({ timeout: 5000 });
  await expect(
    page.getByLabel("Drawing number *", { exact: true }),
  ).toHaveValue("DRW-8625", { timeout: 60000 });
  expect(Date.now() - t).toBeLessThan(60000);
  await expect(page.getByLabel("Drawing title", { exact: true })).toHaveValue(
    "PUMP SUPPORT",
  );
  await expect(page.getByLabel("Revision", { exact: true })).toHaveValue("D");
  await page.getByLabel("Revision", { exact: true }).fill("E");
  await expect(
    page.getByRole("button", { name: "Add reviewed sheet" }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: "I checked these fields" }).check();
  await page.getByRole("button", { name: "Add reviewed sheet" }).click();
  const csv = await exported(page, "Export register");
  expect(csv).toHaveLength(2);
  expect(csv[1]).toEqual([
    "fresh-pump-support.png",
    "1",
    "DRW-8625",
    "PUMP SUPPORT",
    "E",
    "ALUMINIUM 6061",
    "1:2",
    "1 OF 2",
  ]);
  await screenshot(page, `${info.project.name}-title-reader`);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Export register" }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});

test("P&ID built-in sample produces the worked-example findings after review", async ({
  page,
}, info) => {
  const diagnostics: string[] = [];
  const errors = watch(page, diagnostics);
  await openTool(page, "/tools/pid-tag-check/");
  await page.getByRole("button", { name: "Try a sample", exact: true }).click();
  await page.getByRole("button", { name: "Read text" }).click();
  await expect(page.getByLabel("Drawing tags", { exact: true })).toHaveValue(
    /PT-101/,
    { timeout: 60000 },
  );
  expect(
    (await page.getByLabel("Drawing tags", { exact: true }).inputValue())
      .split("\n")
      .sort(),
  ).toEqual(["FT-102", "P-101", "PT-101", "PT-101", "XV-104"]);
  await page.getByRole("button", { name: "Use sample reference" }).click();
  await expect(
    page.getByRole("button", { name: "Compare tags" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "I checked the drawing tags" })
    .check();
  await page.getByRole("button", { name: "Compare tags" }).click();
  const csv = await exported(page, "Export tag comparison");
  expect(csv.slice(1)).toEqual([
    ["FT-102", "Matched", "1", "1"],
    ["P-101", "Matched", "1", "1"],
    ["PT-101", "Matched", "2", "1"],
    ["TT-103", "Only in list", "0", "1"],
    ["XV-104", "Only in drawing", "1", "0"],
  ]);
  await screenshot(page, `${info.project.name}-pid-worked-example`);
  await info.attach("reviewed-tesseract-diagnostics", {
    body: JSON.stringify(diagnostics),
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});

test("P&ID new-image OCR and reviewed reference CSV produce exact tag differences", async ({
  page,
}, info) => {
  const diagnostics: string[] = [];
  const errors = watch(page, diagnostics);
  await openTool(page, "/tools/pid-tag-check/");
  const buffer = await png("pid-tags", [
    ["P-101", "P-752"],
    ["PT-101", "PT-753"],
    ["FT-102", "FT-754"],
    ["XV-104", "XV-755"],
  ]);
  await page
    .getByLabel("Drawing files", { exact: true })
    .setInputFiles({ name: "fresh-pid.png", mimeType: "image/png", buffer });
  await page.getByRole("button", { name: "Read text" }).click();
  await expect(page.getByLabel("Drawing tags", { exact: true })).toHaveValue(
    /PT-753/,
    { timeout: 60000 },
  );
  const tags = (
    await page.getByLabel("Drawing tags", { exact: true }).inputValue()
  )
    .split("\n")
    .sort();
  expect(tags).toEqual(["FT-754", "P-752", "PT-753", "PT-753", "XV-755"]);
  await page.getByLabel("Reference tag file", { exact: true }).setInputFiles({
    name: "reference.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Tag,Description\nP-752,Pump\nPT-753,Pressure\nFT-754,Flow\nTT-756,Temperature",
    ),
  });
  await expect(
    page.getByRole("button", { name: "Compare tags" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "I checked the drawing tags" })
    .check();
  const t = Date.now();
  await page.getByRole("button", { name: "Compare tags" }).click();
  await expect(
    page.getByRole("button", { name: "Only in drawing 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Only in list 1", exact: true }),
  ).toBeVisible();
  expect(Date.now() - t).toBeLessThan(2000);
  const csv = await exported(page, "Export tag comparison");
  expect(csv.find((r) => r[0] === "PT-753")).toEqual([
    "PT-753",
    "Matched",
    "2",
    "1",
  ]);
  expect(csv.find((r) => r[0] === "XV-755")).toEqual([
    "XV-755",
    "Only in drawing",
    "1",
    "0",
  ]);
  expect(csv.find((r) => r[0] === "TT-756")).toEqual([
    "TT-756",
    "Only in list",
    "0",
    "1",
  ]);
  await screenshot(page, `${info.project.name}-pid-tags`);
  await page
    .getByLabel("Drawing tags", { exact: true })
    .fill("PT-753\nunsupported");
  await expect(
    page.getByRole("button", { name: "Compare tags" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "I checked the drawing tags" })
    .check();
  await page.getByRole("button", { name: "Compare tags" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "unsupported tag formats",
  );
  await info.attach("reviewed-tesseract-diagnostics", {
    body: JSON.stringify(diagnostics),
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});

test("title reader handles file queue, PDF, cancellation and unsupported input recovery", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop-chromium",
    "Shared OCR file-decoder/error path on desktop; primary flows run on all three browsers.",
  );
  const errors = watch(page, undefined, true);
  await openTool(page, "/tools/title-block-reader/");
  const input = page.getByLabel("Drawing files", { exact: true });
  await input.setInputFiles({
    name: "wrong.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a drawing"),
  });
  await expect(page.getByRole("alert")).toContainText("PNG, JPEG or PDF");
  await input.setInputFiles([
    "public/samples/title-block.pdf",
    "public/samples/title-block.png",
  ]);
  await expect(page.getByLabel("PDF page")).toHaveValue("1");
  await page.getByRole("button", { name: "Read text" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("cancelled");
  await page.getByRole("button", { name: "Read text" }).click();
  await expect(
    page.getByLabel("Drawing number *", { exact: true }),
  ).toHaveValue("DWG-7428", { timeout: 60000 });
  // A scan can confuse O and 0 in the sheet label. Exercise the explicit human
  // correction step; OCR success is not approval of every field.
  await page.getByLabel("Sheet", { exact: true }).fill("1 OF 2");
  await page.getByRole("checkbox", { name: "I checked these fields" }).check();
  await page.getByRole("button", { name: "Add reviewed sheet" }).click();
  await page.getByLabel("Selected drawing", { exact: true }).selectOption("1");
  await expect(
    page.getByLabel("Drawing number *", { exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "Read text" }).click();
  await expect(
    page.getByLabel("Drawing number *", { exact: true }),
  ).toHaveValue("DWG-7428", { timeout: 60000 });
  await page.getByRole("checkbox", { name: "I checked these fields" }).check();
  await page.getByRole("button", { name: "Add reviewed sheet" }).click();
  expect(await exported(page, "Export register")).toHaveLength(3);
  expect(errors).toEqual([]);
});

test("new tool discovery works without JavaScript and files without labels fabricate no fields", async ({
  browser,
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop-chromium",
    "Discovery/negative recognition on desktop.",
  );
  const context = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await context.newPage();
  for (const slug of ["bom-check", "title-block-reader", "pid-tag-check"]) {
    const r = await staticPage.goto(`${origin}/tools/${slug}/`);
    expect(r?.status()).toBe(200);
    await expect(staticPage.locator("h1")).toHaveCount(1);
    await expect(staticPage.locator("link[rel=canonical]")).toHaveAttribute(
      "href",
      `https://mst-us.ai/tools/${slug}/`,
    );
    await expect(staticPage.locator("main")).toContainText("CSV");
    if (slug === "pid-tag-check") {
      await expect(
        staticPage.getByRole("heading", {
          name: "Does this P&ID agree with the instrument list?",
        }),
      ).toBeVisible();
      await expect(
        staticPage.getByRole("link", { name: "Download sample P&ID" }),
      ).toBeVisible();
      await expect(staticPage.locator(".example-figure img")).toBeVisible();
    }
  }
  await staticPage.goto(`${origin}/tools/`);
  await expect(staticPage.locator(".tool-entry")).toHaveCount(5);
  await context.close();
  const errors = watch(page);
  await openTool(page, "/tools/title-block-reader/");
  const blank = new Resvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300"><rect width="500" height="300" fill="white"/><circle cx="250" cy="150" r="75" fill="none" stroke="black" stroke-width="2"/></svg>',
  )
    .render()
    .asPng();
  await page.getByLabel("Drawing files", { exact: true }).setInputFiles({
    name: "no-labels.png",
    mimeType: "image/png",
    buffer: blank,
  });
  await page.getByRole("button", { name: "Read text" }).click();
  await expect(
    page.getByText(/No recognizable title-block labels found/),
  ).toBeVisible({ timeout: 60000 });
  await expect(
    page.getByLabel("Drawing number *", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Add reviewed sheet" }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
