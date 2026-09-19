import { test } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { auditBom, combinePart, sourceRows } from "../src/bom-check.ts";
import { guessColumns, parseCsv, toCsv } from "../src/csv.ts";
import { extractTitle } from "../src/title-block.ts";
import {
  compareTags,
  defaultPrefixes,
  normalizeTag,
  suggestTags,
  tagList,
} from "../src/pid-tags.ts";
function source(csv: string) {
  const data = parseCsv(csv);
  return {
    header: data[0],
    rows: sourceRows(data),
    map: guessColumns(data[0]),
  };
}
test("BOM review retains identifiers and custom columns while detecting gaps and conflicts", () => {
  const { header, rows, map } = source(
    "Part number,Qty,Material,Unit,Revision\n00007,0.1,Steel,ea,A\n00007,0.2,Steel,ea,A\nB,1,Steel,ea,A\nB,1,Steel,m,A\n,2,,ea,A\nC,,Steel,ea,A",
  );
  const review = auditBom(header, rows, map);
  assert.deepEqual(
    review.groups.map((g) => [g.part, g.total]),
    [
      ["00007", "0.3"],
      ["B", null],
    ],
  );
  assert(review.issues.some((i) => i.kind === "Missing part number"));
  assert(review.issues.some((i) => i.kind === "Missing quantity"));
  assert(review.issues.some((i) => i.kind === "Missing material"));
  const merged = combinePart(header, rows, map, "00007");
  assert.deepEqual(merged[0], {
    id: "r0",
    source: [1, 2],
    cells: ["00007", "0.3", "Steel", "ea", "A"],
  });
  assert.deepEqual(rows[0].cells, ["00007", "0.1", "Steel", "ea", "A"]);
  assert.throws(
    () => combinePart(header, rows, map, "B"),
    /cannot be combined/,
  );
  assert.deepEqual(
    parseCsv(toCsv([header, ...merged.map((r) => r.cells)]))[0],
    header,
  );
});
test("BOM grouping is case-sensitive, conservative about revision and validates precise sums", () => {
  for (const [text, expected] of [
    ["Part number,Qty\nA,999999999\nA,1.000001", null],
    ["Part number,Qty\nA,999999999\nA,0.000001", "999999999.000001"],
    ["Part number,Qty\nA,1\nA,bad", null],
    ["Part number,Qty,Rev\nA,1,A\nA,2,B", null],
  ] as const) {
    const s = source(text);
    assert.equal(auditBom(s.header, s.rows, s.map).groups[0].total, expected);
  }
  const s = source("Part number,Qty\nA,1\na,1");
  assert.equal(auditBom(s.header, s.rows, s.map).groups.length, 0);
  assert.throws(
    () => auditBom(s.header, s.rows, { ...s.map, quantity: 0 }),
    /only one/,
  );
});
test("large repeated BOMs stay bounded and use exact arithmetic", () => {
  const s = source(
    "Part number,Qty,Unit\n" +
      Array.from({ length: 10000 }, () => "0001,0.000001,ea").join("\n"),
  );
  const started = performance.now();
  assert.equal(auditBom(s.header, s.rows, s.map).groups[0].total, "0.01");
  assert(performance.now() - started < 2000);
});
test("title reader extracts labelled values, preserves revisions and leaves ambiguity blank", () => {
  const result = extractTitle(
    "DRAWING NO: 000128-A\nTITLE: PUMP BASE\nREV: 03\nMATERIAL: ALUMINIUM 6061\nSCALE: 1:2\nSHEET: 1 OF 2",
  );
  assert.deepEqual(result.values, {
    drawingNumber: "000128-A",
    title: "PUMP BASE",
    revision: "03",
    material: "ALUMINIUM 6061",
    scale: "1:2",
    sheet: "1 OF 2",
  });
  assert.equal(extractTitle("REV: A\nREV: B").values.revision, "");
  assert.deepEqual(extractTitle("REV: A\nREV: B").ambiguous, ["revision"]);
  assert.equal(
    extractTitle("unlabelled random numbers 1234").values.drawingNumber,
    "",
  );
  assert.equal(
    extractTitle("图号：0012\n版本：B").values.drawingNumber,
    "0012",
  );
});
test("P&ID tag suggestions use explicit prefixes and do not infer split or unsupported formats", () => {
  assert.deepEqual(
    suggestTags(
      "PT-101 FT - 002A PT-101 TK 22 random AX-55 scale 1:2 PT-1234567",
      defaultPrefixes,
    ),
    ["PT-101", "FT-002A", "PT-101", "TK-22"],
  );
  assert.deepEqual(suggestTags("PT\n101 arbitrary words", defaultPrefixes), []);
  assert.deepEqual(
    suggestTags("101-PT-02 PT-1-2 A_PT-11", defaultPrefixes),
    [],
  );
  assert.deepEqual(suggestTags("AX-55", "AX"), ["AX-55"]);
  assert.throws(() => suggestTags("PT-101", "PT|.*"), /prefixes/);
});
test("reviewed tag lists accept CSV, preserve zeroes and report exact membership and occurrences", () => {
  assert.equal(normalizeTag(" pt – 001a "), "PT-001A");
  const drawing = tagList("pt-001\nPT-001\nP-2");
  const list = tagList(
    'Tag,Description\nPT-001,"Pressure, inlet"\nTT-3,Temperature',
  );
  assert.deepEqual(compareTags(drawing, list), [
    { tag: "P-2", status: "Only in drawing", drawingCount: 1, listCount: 0 },
    { tag: "PT-001", status: "Matched", drawingCount: 2, listCount: 1 },
    { tag: "TT-3", status: "Only in list", drawingCount: 0, listCount: 1 },
  ]);
  assert.throws(() => tagList("Tag,Note\n,missing"), /missing/);
  assert.throws(() => tagList("Tag,Tag number\nP-1,P-1"), /one Tag column/);
  assert.throws(() => tagList("101-PT-02"), /unsupported/);
  assert.throws(() => compareTags([], list), /Both lists/);
});
