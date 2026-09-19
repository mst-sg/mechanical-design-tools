import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCsv,
  guessColumns,
  mappedRows,
  toCsv,
  numericQuantity,
} from "../src/csv.ts";
import { compareBoms } from "../src/compare.ts";
import { extractTable, wordsFromTsv } from "../src/ocr-table.ts";
import type { Word } from "../src/types.ts";
function bom(text: string) {
  const cells = parseCsv(text);
  return mappedRows(cells, guessColumns(cells[0] ?? []));
}
test("Excel BOM dialects preserve part numbers, quoted commas and multiline descriptions", () => {
  const rows = parseCsv(
    '\uFEFFPart number;Description;Qty\r\n000123;"Bracket, \"\"A\"\"\nLeft side";2\r\n',
  );
  assert.deepEqual(rows, [
    ["Part number", "Description", "Qty"],
    ["000123", 'Bracket, "A"\nLeft side', "2"],
  ]);
  assert.deepEqual(parseCsv("Part number\tQty\nM6\t4"), [
    ["Part number", "Qty"],
    ["M6", "4"],
  ]);
});
test("malformed records are rejected instead of silently shifting fields", () => {
  for (const source of ["A,B\n1,2,3", 'A,B\n"bad,2', 'A,B\n"one"garbage,2'])
    assert.throws(() => parseCsv(source));
});
test("spreadsheet exports cannot execute formula cells", () => {
  const csv = toCsv([
    ['=HYPERLINK("x")', "  @SUM(1)", "+1", "-2", "\t=1", "0012", "normal"],
  ]);
  const row = parseCsv(csv)[0];
  assert.deepEqual(row, [
    '\'=HYPERLINK("x")',
    "'  @SUM(1)",
    "'+1",
    "'-2",
    "'\t=1",
    "0012",
    "normal",
  ]);
});
test("comparison finds revisions and ignores item order and numeric formatting", () => {
  const a = bom(
    "Item,Part number,Description,Qty,Material\n1,A,Bracket,2,Steel\n2,B,Pin,4,Steel\n3,C,Seal,1,Rubber",
  );
  const b = bom(
    "Item,Part number,Description,Qty,Material\n9,B,Pin,4.0,Steel\n1,A,Bracket,3,Aluminium\n4,D,Washer,6,Steel",
  );
  const diff = compareBoms(a, b);
  assert.deepEqual(
    diff.map((r) => [r.key, r.status, r.delta, r.changes]),
    [
      ["A", "Changed", 1, ["Quantity", "Material"]],
      ["B", "Unchanged", 0, []],
      ["C", "Removed", -1, []],
      ["D", "Added", 6, []],
    ],
  );
});
test("keys are case sensitive and duplicate or missing keys and ambiguous quantities block comparison", () => {
  const clean = bom("Part number,Qty\nA,1");
  assert.throws(
    () => compareBoms(clean, bom("Part number,Qty\nA,1\nA,2")),
    /duplicate/,
  );
  for (const cell of ["2 pcs", "1,000", "-1", "NaN", "Infinity", ""]) {
    const other = bom('Part number,Qty\nA,"' + cell + '"');
    assert.throws(() => compareBoms(clean, other), /quantity/);
  }
  assert.equal(
    compareBoms(clean, bom("Part number,Qty\na,1")).filter(
      (x) => x.status === "Added",
    ).length,
    1,
  );
  assert.throws(
    () => compareBoms(clean, bom("Part number,Qty\n,1")),
    /missing/,
  );
});
test("fractional quantities and explicit Chinese mappings are supported", () => {
  assert.equal(numericQuantity("0.5"), 0.5);
  assert.equal(numericQuantity("1e3"), null);
  const r = bom("图号,名称,数量,材料\n001,支架,0.5,铝");
  assert.equal(r[0].partNumber, "001");
  assert.equal(r[0].material, "铝");
  assert.throws(
    () =>
      mappedRows(
        [
          ["A", "B"],
          ["1", "2"],
        ],
        { item: -1, description: -1, material: -1, partNumber: 0, quantity: 0 },
      ),
    /only one/,
  );
});
test("OCR table geometry maps headers and leaves unrecognized quantity blank", () => {
  const word = (text: string, x: number, y: number): Word => ({
    text,
    x,
    y,
    width: text.length * 10,
    height: 20,
    confidence: 90,
  });
  const words = [
    word("ITEM", 10, 10),
    word("PART", 100, 10),
    word("NUMBER", 155, 10),
    word("DESCRIPTION", 320, 10),
    word("QTY", 620, 10),
    word("MATERIAL", 730, 10),
    word("1", 10, 60),
    word("BRK-100", 100, 60),
    word("Mounting", 320, 60),
    word("bracket", 410, 60),
    word("2", 620, 60),
    word("Steel", 730, 60),
    word("2", 10, 110),
    word("PIN-020", 100, 110),
    word("Locating", 320, 110),
    word("pin", 410, 110),
    word("Steel", 730, 110),
  ];
  const result = extractTable(words);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].partNumber, "BRK-100");
  assert.equal(result.rows[0].description, "Mounting bracket");
  assert.equal(result.rows[0].quantity, "2");
  assert.equal(result.rows[1].quantity, "");
});
test("OCR does not invent a BOM when a drawing has no table header", () => {
  assert.deepEqual(
    extractTable([
      { text: "Mounting", x: 1, y: 2, width: 60, height: 20, confidence: 90 },
    ]).rows,
    [],
  );
  assert.deepEqual(
    wordsFromTsv(
      "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t10\t20\t80\t30\t92.1\tBRK-100",
    ),
    [
      {
        text: "BRK-100",
        x: 10,
        y: 20,
        width: 80,
        height: 30,
        confidence: 92.1,
      },
    ],
  );
});

import { removeTableRules } from "../src/preprocess.ts";
test("recognition preprocessing clears table rules and preserves short character strokes", () => {
  const width = 500,
    height = 300,
    data = new Uint8ClampedArray(width * height * 4).fill(255);
  const ink = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 0;
  };
  for (let x = 10; x < 490; x++) ink(x, 40);
  for (let y = 20; y < 280; y++) ink(50, y);
  for (let y = 90; y < 115; y++) ink(100, y);
  removeTableRules(data, width, height);
  assert.equal(data[(40 * width + 250) * 4], 255);
  assert.equal(data[(150 * width + 50) * 4], 255);
  assert.equal(data[(100 * width + 100) * 4], 0);
});

test("quantity changes retain small decimal differences and reject excess precision", () => {
  const result = compareBoms(
    bom("Part number,Qty\nA,999999999"),
    bom("Part number,Qty\nA,999999999.000001"),
  );
  assert.equal(result[0].delta, 0.000001);
  assert.equal(result[0].status, "Changed");
  assert.equal(numericQuantity("1.0000001"), null);
  assert.equal(numericQuantity("1000000001"), null);
  assert.equal(parseCsv(toCsv([[-2]]))[0][0], "-2");
});
