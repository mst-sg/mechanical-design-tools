import test from "node:test";
import assert from "node:assert/strict";
import {
  checkPackage,
  guessPackageColumn,
  packageReportCsv,
  packageSample,
} from "../src/delivery-package";
test("delivery exercise finds an empty STEP, missing PDF and extra note without claiming CAD validation", () => {
  const r = checkPackage(
    packageSample.manifest,
    0,
    packageSample.files,
    "filename",
  );
  assert.equal(r.found, 1);
  assert.deepEqual(
    r.findings.map((f) => [f.record, f.code]),
    [
      [3, "empty-file"],
      [4, "missing-file"],
      [null, "not-in-manifest"],
    ],
  );
  const clean = checkPackage(
    packageSample.manifest,
    0,
    packageSample.corrected,
    "filename",
  );
  assert.equal(clean.found, 3);
  assert.deepEqual(clean.findings, []);
  assert.match(packageReportCsv(clean), /actual revisions were not verified/);
});
test("duplicate filenames remain ambiguous until relative paths identify their folders", () => {
  const files = [
    { name: "part.pdf", relativePath: "a/part.pdf", size: 10 },
    { name: "part.pdf", relativePath: "b/part.pdf", size: 20 },
  ];
  const ambiguous = checkPackage("File\npart.pdf", 0, files, "filename");
  assert.equal(ambiguous.found, 0);
  assert.equal(ambiguous.findings[0].code, "ambiguous-file");
  assert.deepEqual(
    checkPackage("File\na/part.pdf\nb\\part.pdf", 0, files, "relative-path")
      .findings,
    [],
  );
  assert.throws(
    () =>
      checkPackage(
        "File\na/part.pdf",
        0,
        [{ name: "part.pdf", size: 10 }],
        "relative-path",
      ),
    /folder selection/,
  );
});
test("invalid paths, repeated requirements and case differences cannot pass silently", () => {
  const r = checkPackage(
    "File,Note\n../part.pdf,x\n/root.pdf,x\nC:/part.pdf,x\n,x\npart.pdf,x\npart.pdf,x\nPART.pdf,x",
    0,
    [{ name: "part.pdf", relativePath: "part.pdf", size: 10 }],
    "relative-path",
  );
  assert.equal(r.found, 0);
  assert.equal(
    r.findings.filter((f) => f.code === "invalid-required-path").length,
    4,
  );
  assert.equal(
    r.findings.filter((f) => f.code === "duplicate-requirement").length,
    2,
  );
  assert.equal(r.findings.at(-1)?.code, "missing-file");
});
test("metadata limits, mappings, formula export and relative path validation", () => {
  assert.equal(guessPackageColumn("File,Filename\na,b"), -1);
  assert.throws(
    () => checkPackage("File\na", -1, [{ name: "a", size: 1 }], "filename"),
    /Select the required/,
  );
  assert.throws(
    () => checkPackage("File\na", 0, [], "filename"),
    /Select the package/,
  );
  assert.throws(
    () =>
      checkPackage(
        "File\na",
        0,
        Array.from({ length: 10001 }, () => ({ name: "a", size: 1 })),
        "filename",
      ),
    /10,000/,
  );
  const r = checkPackage(
    "File\n=private.csv",
    0,
    [{ name: "other.csv", size: 1 }],
    "filename",
  );
  assert.match(packageReportCsv(r), /'=private/);
  for (const size of [0, -1, NaN, Infinity, 1.5])
    assert.equal(
      checkPackage("File\na", 0, [{ name: "a", size }], "filename").findings[0]
        .code,
      "empty-file",
    );
});
