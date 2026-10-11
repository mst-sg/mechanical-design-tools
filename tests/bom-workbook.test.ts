import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { makeBomWorkbook } from "../src/bom-workbook";
import { blankRow } from "../src/types";

test("Excel retains exact identifiers and unsafe-looking text, numeric quantities and reviewable unknowns", async () => {
  const rows = [
    {
      ...blankRow(),
      item: "001",
      partNumber: "000007",
      description: '=HYPERLINK("https://example.invalid", "part")',
      quantity: "2.500000",
      material: "铝 6061",
    },
    {
      ...blankRow(),
      item: "2",
      partNumber: "000007",
      description: "+cmd",
      quantity: "AR",
      material: "=1+1",
      confidence: 60,
    },
    { ...blankRow(), item: "3", partNumber: "", quantity: "0" },
  ];
  const bytes = await makeBomWorkbook(rows, {
    filename: "=PRIVATE-drawing.pdf",
    page: 2,
    crop: { left: 3, top: 50, width: 94, height: 42 },
    jobId: "example-job-id",
    engine: "Example test engine",
    text: "A".repeat(31999) + "😀" + "B".repeat(3000),
    exportedAt: new Date("2026-10-11T12:00:00Z"),
  });
  assert.deepEqual([...bytes.slice(0, 4)], [80, 75, 3, 4]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet("BOM")!;
  assert.equal(sheet.rowCount, 4);
  assert.equal(sheet.getCell("A2").value, "001");
  assert.equal(sheet.getCell("B2").value, "000007");
  assert.equal(sheet.getCell("C2").value, rows[0].description);
  assert.equal(sheet.getCell("D2").value, 2.5);
  assert.equal(sheet.getCell("D3").value, "AR");
  assert.equal(sheet.getCell("D4").value, 0);
  assert.equal(sheet.getCell("E2").value, "铝 6061");
  assert.equal(sheet.getCell("E3").value, "=1+1");
  assert.match(String(sheet.getCell("F2").value), /Repeated part number/);
  assert.match(
    String(sheet.getCell("F3").value),
    /Check quantity.*Check recognized text/,
  );
  assert.match(String(sheet.getCell("F4").value), /missing part number/);
  assert.deepEqual(sheet.autoFilter, "A1:F1");
  assert.equal(sheet.views[0].state, "frozen");
  const source = workbook.getWorksheet("Source and review")!;
  assert.equal(source.getCell("B3").value, "=PRIVATE-drawing.pdf");
  assert.equal(source.getCell("B4").value, 2);
  assert.equal(
    source.getCell("B5").value,
    "Left 3, top 50, width 94, height 42",
  );
  assert.equal(
    String(source.getCell("B11").value) + String(source.getCell("B12").value),
    "A".repeat(31999) + "😀" + "B".repeat(3000),
  );
  workbook.eachSheet((tab) =>
    tab.eachRow((row) =>
      row.eachCell((cell) =>
        assert.notEqual(cell.type, ExcelJS.ValueType.Formula),
      ),
    ),
  );
});

test("Excel does not invent missing provenance or coerce ambiguous quantities", async () => {
  const values = [
    "",
    "2 EA",
    "1e3",
    "1,234",
    "1.1234567",
    "9007199254740993",
    "=1+1",
  ];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    (await makeBomWorkbook(
      values.map((quantity) => ({ ...blankRow(), quantity })),
    )) as unknown as ExcelJS.Buffer,
  );
  values.forEach((value, index) =>
    assert.equal(
      workbook.getWorksheet("BOM")!.getCell(`D${index + 2}`).value ?? "",
      value,
    ),
  );
  assert.equal(
    workbook.getWorksheet("Source and review")!.getCell("B4").value,
    "Not available in this browser",
  );
});

test("unexportable cells and empty or oversized tables fail explicitly", async () => {
  await assert.rejects(makeBomWorkbook([]), /1 and 500/);
  await assert.rejects(
    makeBomWorkbook(Array.from({ length: 501 }, blankRow)),
    /1 and 500/,
  );
  await assert.rejects(
    makeBomWorkbook([{ ...blankRow(), description: "a".repeat(32768) }]),
    /32,767/,
  );
  await assert.rejects(
    makeBomWorkbook([{ ...blankRow(), partNumber: "A\u0000B" }]),
    /control character/,
  );
});
