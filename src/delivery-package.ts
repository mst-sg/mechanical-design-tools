import { parseCsv, toCsv } from "./csv";
export type PackageFile = { name: string; size: number; relativePath?: string };
export type PackageFinding = {
  record: number | null;
  path: string;
  code: string;
  selected: string;
  detail: string;
};
export type PackageReport = {
  required: number;
  selected: number;
  found: number;
  mode: "filename" | "relative-path";
  findings: PackageFinding[];
};
export function guessPackageColumn(text: string): number {
  try {
    const hits = (parseCsv(text)[0] ?? []).flatMap((h, i) =>
      ["file", "filename", "path", "requiredfile", "relativepath"].includes(
        h.toLowerCase().replace(/[\s_.-]/g, ""),
      )
        ? [i]
        : [],
    );
    return hits.length === 1 ? hits[0] : -1;
  } catch {
    return -1;
  }
}
function cleanPath(value: string, mode: PackageReport["mode"]): string {
  const path = value.trim().replaceAll("\\", "/");
  if (
    !path ||
    /[\u0000-\u001f]/.test(path) ||
    /^(?:\/|[a-z]:)/i.test(path) ||
    path.split("/").some((p) => !p || p === "." || p === "..") ||
    (mode === "filename" && path.includes("/"))
  )
    throw new Error(
      mode === "filename"
        ? "Use a filename without folders in filename mode."
        : "Use a relative path without an absolute root, empty segment, . or ...",
    );
  return path;
}
export function checkPackage(
  text: string,
  column: number,
  files: PackageFile[],
  mode: PackageReport["mode"],
): PackageReport {
  const rows = parseCsv(text);
  if (rows.length < 2)
    throw new Error(
      "Manifest: supply a header and at least one required-file record.",
    );
  if (!Number.isInteger(column) || column < 0 || column >= rows[0].length)
    throw new Error("Select the required filename/path column.");
  if (!files.length)
    throw new Error("Select the package files or use the sample package.");
  if (files.length > 10000) throw new Error("Select at most 10,000 files.");
  const findings: PackageFinding[] = [],
    required = new Map<string, number[]>(),
    selected = new Map<string, { index: number; file: PackageFile }[]>();
  rows.slice(1).forEach((r, i) => {
    let path: string;
    try {
      path = cleanPath(r[column] ?? "", mode);
    } catch (e) {
      findings.push({
        record: i + 2,
        path: r[column] ?? "",
        code: "invalid-required-path",
        selected: "",
        detail: (e as Error).message,
      });
      return;
    }
    const group = required.get(path) ?? [];
    group.push(i + 2);
    required.set(path, group);
  });
  files.forEach((file, index) => {
    const raw = mode === "filename" ? file.name : file.relativePath;
    if (!raw)
      throw new Error(
        "Relative-path mode requires a folder selection. Choose the package root folder.",
      );
    const path = cleanPath(raw, mode),
      group = selected.get(path) ?? [];
    group.push({ index: index + 1, file });
    selected.set(path, group);
  });
  let found = 0;
  for (const [path, records] of required) {
    const matches = selected.get(path) ?? [],
      selectedIds = matches.map((m) => String(m.index)).join("; ");
    for (const record of records) {
      const add = (code: string, detail: string) =>
        findings.push({ record, path, code, selected: selectedIds, detail });
      if (records.length > 1)
        add(
          "duplicate-requirement",
          "This required path occurs more than once in the manifest.",
        );
      if (!matches.length)
        add(
          "missing-file",
          "Required file is absent from the current selection.",
        );
      if (matches.length > 1)
        add(
          "ambiguous-file",
          "Several selected files match this identity; choose the intended file or use relative paths.",
        );
      if (
        matches.some(
          (m) => !Number.isSafeInteger(m.file.size) || m.file.size <= 0,
        )
      )
        add("empty-file", "A matching file is empty or has an invalid size.");
      if (
        records.length === 1 &&
        matches.length === 1 &&
        Number.isSafeInteger(matches[0].file.size) &&
        matches[0].file.size > 0
      )
        found++;
    }
  }
  for (const [path, matches] of selected)
    if (!required.has(path)) {
      findings.push({
        record: null,
        path,
        code: "not-in-manifest",
        selected: matches.map((m) => m.index).join("; "),
        detail:
          "Selected file is not requested by this manifest. Confirm its delivery scope.",
      });
    }
  return {
    required: rows.length - 1,
    selected: files.length,
    found,
    mode,
    findings,
  };
}
export function packageReportCsv(report: PackageReport): string {
  return toCsv([
    [
      "Manifest record",
      "Required / selected path",
      "Check",
      "Selected file positions",
      "Finding",
      "Match mode",
    ],
    ...report.findings.map((r) => [
      r.record ?? "",
      r.path,
      r.code,
      r.selected,
      r.detail,
      report.mode,
    ]),
    ...(report.findings.length
      ? []
      : [
          [
            "",
            "",
            "manifest-files-present",
            "",
            "Every required identity has one non-empty file. Contents, native CAD references and actual revisions were not verified.",
            report.mode,
          ],
        ]),
  ]);
}
export const packageSample = {
  manifest:
    "Filename,Document,Declared revision\nbracket-B.pdf,Bracket drawing,B\nbracket-B.step,Bracket model,B\nvalve-A.pdf,Valve drawing,A\n",
  files: [
    { name: "bracket-B.pdf", size: 1800 },
    { name: "bracket-B.step", size: 0 },
    { name: "notes.txt", size: 42 },
  ],
  corrected: [
    { name: "bracket-B.pdf", size: 1800 },
    { name: "bracket-B.step", size: 3200 },
    { name: "valve-A.pdf", size: 1700 },
  ],
};
