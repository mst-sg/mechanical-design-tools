import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkConnections, connectionInput, connectionReportCsv, connectionSamples } from "../src/connection-check";
import { parseCsv } from "../src/csv";
const fixture = (name: string) => readFileSync(new URL(`../public/labs/connection-check/${name}`, import.meta.url), "utf8");
const input = (corrected = false) => ({ connections: connectionInput(fixture(corrected ? "connections-corrected.csv" : "connections-errors.csv")), tags: connectionInput(fixture("reviewed-tags.csv")), bom: connectionInput(fixture(corrected ? "bom-corrected.csv" : "bom-errors.csv")) });

test("downloadable fault fixture matches the independent record-by-record oracle; corrected exercise resolves it", () => {
  const report = checkConnections(input());
  const expected = JSON.parse(fixture("expected-findings.json"));
  assert.deepEqual(report.findings.map(({ source, row, code }) => [source, row, code]), expected);
  assert.equal(report.connections, 5); assert.equal(report.tags, 5); assert.equal(report.bomChecked, true);
  assert.equal(parseCsv(connectionReportCsv(report)).length, 13);
  const corrected = checkConnections(input(true));
  assert.deepEqual(corrected.findings, []);
  assert.match(connectionReportCsv(corrected), /Physical connectivity.*not checked/);
  assert.equal(connectionSamples.connections, fixture("connections-errors.csv"));
  assert.equal(connectionSamples.corrected, fixture("connections-corrected.csv"));
  assert.equal(connectionSamples.bom, fixture("bom-errors.csv"));
});
test("matching preserves zeros, case and directed order; optional BOM remains explicitly unchecked", () => {
  const i = { connections: connectionInput("from,to\n0001,a\na,0001\n0001,A\n1,a"), tags: connectionInput("tag\n0001\na"), bom: connectionInput() };
  const r = checkConnections(i);
  assert.deepEqual(r.findings.map(f => [f.row, f.code, f.tag]), [[4,"unknown-endpoint","A"],[5,"unknown-endpoint","1"]]);
  assert.equal(r.bomChecked, false);
  assert.equal(parseCsv(connectionReportCsv(r))[1].at(-1), "No");
});
test("untrusted reference, malformed CSV and ambiguous/reused mappings cannot produce a clean report", () => {
  let i = input(); i.tags = connectionInput("tag\nV-101\nV-101"); assert.throws(() => checkConnections(i), /duplicate V-101.*records 2 and 3/);
  i = input(); i.tags = connectionInput("tag,note\n,empty"); assert.throws(() => checkConnections(i), /missing tag/);
  i = input(); i.connections = connectionInput('from,to\n"bad'); assert.throws(() => checkConnections(i), /unclosed/);
  i = input(); i.connections = connectionInput("from,from,to\na,b,c"); assert.throws(() => checkConnections(i), /select the From tag/);
  i.connections.map.from = 0; i.connections.map.to = 0; assert.throws(() => checkConnections(i), /only one field/);
  i = input(); i.bom = connectionInput("tag,part number"); assert.throws(() => checkConnections(i), /at least one data record/);
});
test("BOM duplicate tag assignments stay visible and spreadsheet-formula text is escaped in export", () => {
  const r = checkConnections({ connections: connectionInput('from,to\n=TAG,A'), tags: connectionInput('tag\n=TAG\nA'), bom: connectionInput('tag,part number\n=TAG,P1\n=TAG,P2\nA,PA') });
  assert.equal(r.findings.filter(f => f.code === "multiple-bom-assignments").length, 2);
  assert.match(connectionReportCsv(r), /'=TAG/);
});
