import test from "node:test";
import assert from "node:assert/strict";
import {
  checkLineLists,
  lineInput,
  lineReportCsv,
  lineSamples,
} from "../src/line-list";
const check = (a: string, b: string) =>
  checkLineLists({ register: lineInput(a), drawing: lineInput(b) });

test("line reconciliation identifies the four independent sample discrepancies and their records", () => {
  const r = check(lineSamples.register, lineSamples.drawing);
  assert.deepEqual(
    r.findings.map((f) => [
      f.source,
      f.row,
      f.otherRow,
      f.line,
      f.field,
      f.code,
    ]),
    [
      ["register", 2, 2, "L-001", "Size", "attribute-differs"],
      ["register", 3, 3, "L-002", "To", "attribute-differs"],
      ["register", 4, null, "L-003", "", "absent-from-drawing-records"],
      ["drawing", 4, null, "L-004", "", "absent-from-line-list"],
    ],
  );
  assert.equal(
    check(lineSamples.register, lineSamples.register).findings.length,
    0,
  );
});
test("duplicates and missing identities cannot turn into a clean attribute comparison", () => {
  const r = check("Line,Size\nL,DN25\nL,DN20\n,DN15", "Line,Size\nL,DN25");
  assert.equal(r.comparedLines, 0);
  assert.deepEqual(r.findings.map((f) => f.code).sort(), [
    "duplicate-line-number",
    "duplicate-line-number",
    "missing-line-number",
  ]);
});
test("case, leading zeros, units and endpoint order retain their declared meaning", () => {
  const r = check(
    "Line,Size,From,To\n001,DN25,A,B\na,DN15,C,D",
    "Line,Size,From,To\n001,1 inch,B,A\nA,DN15,C,D\n1,DN25,A,B",
  );
  assert.deepEqual(
    r.findings.filter((f) => f.line === "001").map((f) => f.field),
    ["From", "To", "Size"],
  );
  assert.equal(
    r.findings.filter((f) => f.code.startsWith("absent-")).length,
    3,
  );
});
test("blank attributes, ambiguous mapping and one-sided mapping require review", () => {
  assert.equal(
    check("Line,Size\nL,", "Line,Size\nL,").findings[0].code,
    "missing-attribute",
  );
  assert.throws(
    () => check("Line,Size\nL,DN25", "Line\nL"),
    /Map Size in both/,
  );
  assert.throws(() => check("Line,Line\nA,B", "Line\nA"), /valid Line number/);
  const a = lineInput("Line,Size\nL,DN25");
  a.map.size = 0;
  assert.throws(
    () => checkLineLists({ register: a, drawing: lineInput("Line\nL") }),
    /one field only/,
  );
  assert.throws(() => check('Line\n"unclosed', "Line\nL"), /unclosed/);
  assert.match(
    lineReportCsv(check("Line\n=private", "Line\nother")),
    /'=private/,
  );
  assert.match(lineReportCsv(check("Line\nL", "Line\nL")), /Identity only/);
});
