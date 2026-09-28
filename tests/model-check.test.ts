import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkModels,
  csvRecordRange,
  guessModelMap,
  modelReportCsv,
  modelSamples,
} from "../src/model-check";
import { parseCsv } from "../src/csv";
const input = (text: string) => ({
  text,
  map: guessModelMap(parseCsv(text)[0]),
});
test("sample separates missing, conflicting, ambiguous and unused models", () => {
  const result = checkModels(
    input(modelSamples.bom),
    input(modelSamples.models),
    null,
  );
  assert.equal(result.length, 6);
  assert.equal(result[0].status, "Metadata match");
  assert.equal(result[0].presence, "Not checked");
  assert.match(result[1].findings.join(), /revision differs/);
  assert.deepEqual(result[2].findings, ["No model mapping"]);
  assert.match(result[3].findings.join(), /Multiple model mappings/);
  assert.match(result[4].findings.join(), /BOM revision not specified/);
  assert.equal(result[5].status, "Not in BOM");
  assert.deepEqual(result[3].modelRows, [4, 5]);
});
test("file selection distinguishes missing, duplicate, empty and unindexed files", () => {
  const bom = input("Part number,Revision\n0001,A\n0002,B\n0003,C\n0004,D");
  const models = input(
    "Part number,Revision,Model file\n0001,A,a.step\n0002,B,b.step\n0003,C,c.step\n0004,D,d.step",
  );
  const result = checkModels(bom, models, [
    { name: "a.step", size: 1 },
    { name: "b.step", size: 1 },
    { name: "b.step", size: 2 },
    { name: "c.step", size: 0 },
    { name: "extra.step", size: 1 },
  ]);
  assert.equal(result[0].status, "Files matched");
  assert.match(result[1].findings.join(), /duplicate selected filename/);
  assert.match(result[2].findings.join(), /empty/);
  assert.match(result[3].findings.join(), /file not selected/);
  assert.match(result[4].findings.join(), /no model-index entry/);
  assert.equal(result[0].part, "0001");
});
test("case, missing revisions, repeated BOM keys and conflicting file assignments stay reviewable", () => {
  const result = checkModels(
    input("Part number,Revision\na,01\na,01\nb,\nc,1"),
    input(
      "Part number,Revision,Model file\na,1,shared.step\nb,,shared.step\nC,1,c.step\n,,orphan.step",
    ),
    [],
  );
  assert.match(result[0].findings.join(), /Repeated BOM part/);
  assert.match(result[0].findings.join(), /revision differs/);
  assert.match(result[0].findings.join(), /different parts/);
  assert.match(result[2].findings.join(), /revision not specified/);
  assert.match(result[3].findings.join(), /No model mapping/);
  assert.equal(result[4].part, "C");
  assert.match(result[5].findings.join(), /Missing model-index part/);
});
test("invalid columns, ambiguous headers and oversized joins never silently pass", () => {
  assert.equal(guessModelMap(["Part number", "PN"]).part, -1);
  assert.throws(
    () =>
      checkModels(
        input("Part number,PN\nA,A"),
        input(modelSamples.models),
        null,
      ),
    /map Part number/,
  );
  assert.throws(
    () =>
      checkModels(
        {
          text: "Part number,Revision\nA,B",
          map: { part: 0, revision: 0, file: -1 },
        },
        input(modelSamples.models),
        null,
      ),
    /only one field/,
  );
  const repeated = input("Part number,Revision\n" + "A,B\n".repeat(250));
  const many = input(
    "Part number,Revision,Model file\n" + "A,B,a.step\n".repeat(250),
  );
  assert.throws(() => checkModels(repeated, many, null), /Too many repeated/);
});
test("export preserves evidence, escapes formula fields and source navigation handles multiline CSV", () => {
  const rows = checkModels(
    input('Part number,Revision\n"=cmd",A'),
    input('Part number,Revision,Model file\n"=cmd",A,model.step'),
    null,
  );
  const exported = parseCsv(modelReportCsv(rows));
  assert.equal(exported[1][1], "'=cmd");
  assert.equal(exported[1][2], "2");
  assert.equal(exported[1][7], "Not checked");
  const csv = 'Part number,Description\r\n\r\nA,"one\ntwo"\r\nB,last';
  const range = csvRecordRange(csv, 2)!;
  assert.equal(csv.slice(...range), 'A,"one\ntwo"');
  assert.equal(csv.slice(...csvRecordRange(csv, 3)!), "B,last");
});
