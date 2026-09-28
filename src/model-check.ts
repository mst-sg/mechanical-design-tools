import { parseCsv, toCsv } from "./csv";

export type ModelField = "part" | "revision" | "file";
export type ModelMap = Record<ModelField, number>;
export type ModelInput = { text: string; map: ModelMap };
export type SelectedModel = { name: string; size: number };
export type ModelFinding = {
  part: string;
  bomRow: number | null;
  modelRows: number[];
  requiredRevision: string;
  modelRevisions: string[];
  files: string[];
  status: "Needs review" | "Metadata match" | "Files matched" | "Not in BOM";
  findings: string[];
  presence: "Not checked" | "Checked";
};
const aliases: Record<ModelField, string[]> = {
  part: ["partnumber", "partno", "pn", "mpn", "零件号"],
  revision: ["revision", "rev", "version", "版本"],
  file: ["modelfile", "filename", "file", "model", "模型文件"],
};
export function guessModelMap(headers: string[]): ModelMap {
  const map: ModelMap = { part: -1, revision: -1, file: -1 };
  for (const field of Object.keys(map) as ModelField[]) {
    const hits = headers.flatMap((h, i) =>
      aliases[field].includes(h.toLowerCase().replace(/[\s_.#-]/g, ""))
        ? [i]
        : [],
    );
    // Ambiguous headers require an explicit choice.
    if (hits.length === 1) map[field] = hits[0];
  }
  return map;
}
function records(input: ModelInput, models: boolean) {
  const rows = parseCsv(input.text);
  const name = models ? "Model index" : "BOM";
  if (rows.length < 2)
    throw new Error(`${name}: include a header and at least one data row.`);
  const fields: ModelField[] = models
    ? ["part", "revision", "file"]
    : ["part", "revision"];
  for (const key of fields) {
    const n = input.map[key];
    if (!Number.isInteger(n) || n < -1 || n >= rows[0].length)
      throw new Error(`${name}: select a valid ${key} column.`);
  }
  if (input.map.part < 0 || (models && input.map.file < 0))
    throw new Error(
      `${name}: map Part number${models ? " and Model file" : ""}.`,
    );
  const mapped = fields.map((f) => input.map[f]).filter((n) => n >= 0);
  if (new Set(mapped).size !== mapped.length)
    throw new Error(`${name}: map each column to only one field.`);
  return rows.slice(1).map((row, i) => ({
    row: i + 2,
    part: (row[input.map.part] ?? "").trim(),
    revision: (row[input.map.revision] ?? "").trim(),
    file: models ? (row[input.map.file] ?? "").trim() : "",
  }));
}
export function checkModels(
  bomInput: ModelInput,
  modelInput: ModelInput,
  selected: SelectedModel[] | null,
): ModelFinding[] {
  const bom = records(bomInput, false),
    models = records(modelInput, true);
  if (selected && selected.length > 10000)
    throw new Error("Select at most 10,000 model files.");
  const byPart = new Map<string, typeof models>();
  const bomCounts = new Map<string, number>();
  const fileParts = new Map<string, Set<string>>();
  const disk = new Map<string, SelectedModel[]>();
  for (const row of bom)
    if (row.part) bomCounts.set(row.part, (bomCounts.get(row.part) ?? 0) + 1);
  for (const row of models) {
    if (row.part) {
      const group = byPart.get(row.part) ?? [];
      group.push(row);
      byPart.set(row.part, group);
    }
    if (row.file && row.part) {
      const parts = fileParts.get(row.file) ?? new Set<string>();
      parts.add(row.part);
      fileParts.set(row.file, parts);
    }
  }
  for (const file of selected ?? []) {
    const group = disk.get(file.name) ?? [];
    group.push(file);
    disk.set(file.name, group);
  }
  const comparisons = bom.reduce(
    (n, row) => n + (byPart.get(row.part)?.length ?? 0),
    0,
  );
  if (comparisons > 50000)
    throw new Error(
      "Too many repeated part mappings. Split configurations or resolve duplicate keys before checking this handoff.",
    );
  const results: ModelFinding[] = bom.map((row) => {
    const matches = row.part ? (byPart.get(row.part) ?? []) : [];
    const findings: string[] = [];
    if (!row.part) findings.push("Missing BOM part number");
    if ((bomCounts.get(row.part) ?? 0) > 1)
      findings.push("Repeated BOM part: review configuration and scope");
    if (!matches.length) findings.push("No model mapping");
    if (matches.length > 1)
      findings.push(
        "Multiple model mappings: choose the intended configuration or format",
      );
    if (!row.revision) findings.push("BOM revision not specified");
    for (const model of matches) {
      const prefix = `Model row ${model.row}: `;
      if (!model.revision) findings.push(prefix + "revision not specified");
      else if (row.revision && row.revision !== model.revision)
        findings.push(prefix + "revision differs from BOM");
      if (!model.file) findings.push(prefix + "missing model filename");
      else {
        if ((fileParts.get(model.file)?.size ?? 0) > 1)
          findings.push(prefix + "filename assigned to different parts");
        if (selected !== null) {
          const files = disk.get(model.file) ?? [];
          if (!files.length) findings.push(prefix + "file not selected");
          if (files.length > 1)
            findings.push(prefix + "duplicate selected filename");
          if (files.some((f) => !Number.isFinite(f.size) || f.size <= 0))
            findings.push(prefix + "empty or invalid file size");
        }
      }
    }
    return {
      part: row.part,
      bomRow: row.row,
      modelRows: matches.map((m) => m.row),
      requiredRevision: row.revision,
      modelRevisions: matches.map((m) => m.revision),
      files: matches.map((m) => m.file),
      status: findings.length
        ? "Needs review"
        : selected === null
          ? "Metadata match"
          : "Files matched",
      findings,
      presence: selected === null ? "Not checked" : "Checked",
    };
  });
  for (const model of models) {
    if (model.part && bomCounts.has(model.part)) continue;
    results.push({
      part: model.part,
      bomRow: null,
      modelRows: [model.row],
      requiredRevision: "",
      modelRevisions: [model.revision],
      files: [model.file],
      status: model.part ? "Not in BOM" : "Needs review",
      findings: [
        model.part
          ? "Model-index part is not in this BOM"
          : "Missing model-index part number",
      ],
      presence: "Not checked",
    });
  }
  // Include selected files with no index entry so a delivery can be reconciled in both directions.
  const indexedFiles = new Set(models.map((m) => m.file));
  for (const name of disk.keys())
    if (!indexedFiles.has(name))
      results.push({
        part: "",
        bomRow: null,
        modelRows: [],
        requiredRevision: "",
        modelRevisions: [],
        files: [name],
        status: "Needs review",
        findings: ["Selected file has no model-index entry"],
        presence: "Checked",
      });
  return results;
}
export function modelReportCsv(results: ModelFinding[]) {
  return toCsv([
    [
      "Status",
      "Part number",
      "BOM row",
      "Model index rows",
      "BOM revision",
      "Declared model revisions",
      "Model filenames",
      "File presence",
      "Findings",
    ],
    ...results.map((r) => [
      r.status,
      r.part,
      r.bomRow ?? "",
      r.modelRows.join("; "),
      r.requiredRevision,
      r.modelRevisions.join("; "),
      r.files.join("; "),
      r.presence,
      r.findings.join("; "),
    ]),
  ]);
}
export const modelSamples = {
  bom: "Part number,Revision,Description\nBRK-100,B,Mounting bracket\nPIN-020,A,Locating pin\nVAL-200,A,Valve\nSCR-M6,A,Socket screw\nWSH-M6,,Washer",
  models:
    "Part number,Model file,Revision\nBRK-100,bracket-B.step,B\nPIN-020,pin-old.step,0\nSCR-M6,screw-a.step,A\nSCR-M6,screw-alt.step,A\nWSH-M6,washer.step,A\nLEGACY-10,old.step,A",
};

// Row numbers refer to parsed CSV records (header = 1), including quoted multiline cells.
export function csvRecordRange(
  text: string,
  record: number,
): [number, number] | null {
  let quoted = false,
    start = 0,
    current = 0;
  for (let i = 0; i <= text.length; i++) {
    if (text[i] === '"') {
      if (quoted && text[i + 1] === '"') {
        i++;
        continue;
      }
      quoted = !quoted;
    }
    if (
      i === text.length ||
      (!quoted && (text[i] === "\n" || text[i] === "\r"))
    ) {
      const chunk = text.slice(start, i);
      if (parseCsv(chunk).length && ++current === record) return [start, i];
      if (text[i] === "\r" && text[i + 1] === "\n") i++;
      start = i + 1;
    }
  }
  return null;
}
