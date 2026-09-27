import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareRegisters, exportRegisterDiff } from "../src/register-compare";

const sample = (rev: string) =>
  readFileSync(`public/samples/register-${rev}.csv`, "utf8");
test("sheet identity retains zeroes and detects additions, removals, revisions and title changes", () => {
  const rows = compareRegisters(sample("a"), sample("b"));
  assert.deepEqual(
    rows.map((r) => r.status),
    ["Changed", "Removed", "Unchanged", "Added"],
  );
  const a = "Drawing,Sheet,Revision,Title\nD1,01,A,Test\nD1,1,A,Other";
  assert.equal(compareRegisters(a, a).length, 2);
  assert.equal(
    compareRegisters(a, a.replace("Test", "Changed"))[0].status,
    "Changed",
  );
  assert.equal(
    compareRegisters(a, a.replace("D1,01", "d1,01")).filter(
      (r) => r.status === "Added",
    ).length,
    1,
  );
});
test("ambiguous registers fail closed and exported untrusted cells cannot become formulas", () => {
  for (const bad of [
    "",
    "Drawing,Sheet,Revision,Title\nD1,1,,x",
    "Drawing,Sheet,Revision,Title\nD1,1,A,x\nD1,1,A,x",
    "Drawing,Sheet,Revision,Rev,Title\nD1,1,A,B,x",
  ])
    assert.throws(() => compareRegisters(bad, sample("b")));
  const rows = compareRegisters(
    "Drawing,Sheet,Revision,Title\nD1,1,A,x",
    "Drawing,Sheet,Revision,Title\nD1,1,B,=1+1",
  );
  assert.match(exportRegisterDiff(rows), /'=1\+1/);
});
