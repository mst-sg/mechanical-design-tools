import { parseCsv, toCsv } from "./csv";

export const lineFields = [
  "line",
  "from",
  "to",
  "size",
  "pipingClass",
  "service",
] as const;
export type LineField = (typeof lineFields)[number];
export const lineLabels: Record<LineField, string> = {
  line: "Line number",
  from: "From",
  to: "To",
  size: "Size",
  pipingClass: "Piping class",
  service: "Service",
};
export type LineInput = { text: string; map: Record<LineField, number> };
export type LineSide = "register" | "drawing";
export const lineSources = {
  register: "Line list",
  drawing: "Reviewed drawing records",
};
const aliases: Record<LineField, string[]> = {
  line: ["line", "linenumber", "lineno", "lineid"],
  from: ["from", "fromtag", "source"],
  to: ["to", "totag", "destination"],
  size: ["size", "pipesize", "nominalsize"],
  pipingClass: ["class", "pipingclass", "pipeclass", "spec"],
  service: ["service", "fluid"],
};
export function lineInput(text = ""): LineInput {
  const map = {
    line: -1,
    from: -1,
    to: -1,
    size: -1,
    pipingClass: -1,
    service: -1,
  };
  let headers: string[] = [];
  try {
    headers = parseCsv(text)[0] ?? [];
  } catch {
    /* Validation is shown before checking. */
  }
  for (const f of lineFields) {
    const hits = headers.flatMap((h, i) =>
      aliases[f].includes(h.toLowerCase().replace(/[\s_.#-]/g, "")) ? [i] : [],
    );
    if (hits.length === 1) map[f] = hits[0];
  }
  return { text, map };
}
type LineRow = Record<LineField, string> & { row: number };
function records(input: LineInput, side: LineSide): LineRow[] {
  const rows = parseCsv(input.text);
  if (rows.length < 2)
    throw new Error(
      `${lineSources[side]}: supply a header and at least one record.`,
    );
  for (const f of lineFields) {
    const col = input.map[f];
    if (
      !Number.isInteger(col) ||
      col < -1 ||
      col >= rows[0].length ||
      (f === "line" && col < 0)
    )
      throw new Error(
        `${lineSources[side]}: select a valid ${lineLabels[f]} column.`,
      );
  }
  const mapped = lineFields.map((f) => input.map[f]).filter((n) => n >= 0);
  if (new Set(mapped).size !== mapped.length)
    throw new Error(`${lineSources[side]}: map each column to one field only.`);
  return rows
    .slice(1)
    .map(
      (cells, i) =>
        ({
          row: i + 2,
          ...Object.fromEntries(
            lineFields.map((f) => [f, (cells[input.map[f]] ?? "").trim()]),
          ),
        }) as LineRow,
    );
}
export type LineFinding = {
  source: LineSide;
  row: number;
  otherRow: number | null;
  line: string;
  field: string;
  code: string;
  listed: string;
  observed: string;
  detail: string;
};
export type LineReport = {
  counts: Record<LineSide, number>;
  comparedFields: LineField[];
  comparedLines: number;
  findings: LineFinding[];
};
export function checkLineLists(
  inputs: Record<LineSide, LineInput>,
): LineReport {
  const data = {
    register: records(inputs.register, "register"),
    drawing: records(inputs.drawing, "drawing"),
  };
  const comparedFields = lineFields.filter(
    (f) =>
      f !== "line" && inputs.register.map[f] >= 0 && inputs.drawing.map[f] >= 0,
  );
  for (const f of lineFields.filter((f) => f !== "line")) {
    if (inputs.register.map[f] >= 0 !== inputs.drawing.map[f] >= 0)
      throw new Error(
        `Map ${lineLabels[f]} in both inputs, or choose Not compared in both.`,
      );
  }
  const groups = {
    register: new Map<string, LineRow[]>(),
    drawing: new Map<string, LineRow[]>(),
  };
  const findings: LineFinding[] = [];
  function add(
    source: LineSide,
    r: LineRow,
    code: string,
    detail: string,
    field = "",
    listed = "",
    observed = "",
    otherRow: number | null = null,
  ) {
    findings.push({
      source,
      row: r.row,
      otherRow,
      line: r.line,
      field,
      code,
      listed,
      observed,
      detail,
    });
  }
  for (const side of ["register", "drawing"] as const) {
    for (const r of data[side]) {
      if (!r.line) {
        add(
          side,
          r,
          "missing-line-number",
          "Line identity is blank; this record cannot be reconciled.",
        );
        continue;
      }
      const group = groups[side].get(r.line) ?? [];
      group.push(r);
      groups[side].set(r.line, group);
    }
    for (const group of groups[side].values())
      if (group.length > 1)
        for (const r of group)
          add(
            side,
            r,
            "duplicate-line-number",
            "Several records use this identity. Resolve segment/scope identity before comparing attributes.",
          );
  }
  let comparedLines = 0;
  for (const [id, rows] of groups.register) {
    const other = groups.drawing.get(id);
    if (!other) {
      for (const r of rows)
        add(
          "register",
          r,
          "absent-from-drawing-records",
          "No record with this identity in the supplied reviewed drawing records.",
        );
      continue;
    }
    if (rows.length !== 1 || other.length !== 1) continue;
    comparedLines++;
    for (const f of comparedFields) {
      const a = rows[0][f],
        b = other[0][f];
      if (!a || !b)
        add(
          "register",
          rows[0],
          "missing-attribute",
          `${lineLabels[f]} is blank in at least one input; agreement is unknown.`,
          lineLabels[f],
          a,
          b,
          other[0].row,
        );
      else if (a !== b)
        add(
          "register",
          rows[0],
          "attribute-differs",
          `${lineLabels[f]} differs. Resolve against the controlled drawing and line list.`,
          lineLabels[f],
          a,
          b,
          other[0].row,
        );
    }
  }
  for (const [id, rows] of groups.drawing)
    if (!groups.register.has(id))
      for (const r of rows)
        add(
          "drawing",
          r,
          "absent-from-line-list",
          "No record with this identity in the supplied line list.",
        );
  return {
    counts: { register: data.register.length, drawing: data.drawing.length },
    comparedFields,
    comparedLines,
    findings,
  };
}
export function lineReportCsv(report: LineReport): string {
  return toCsv([
    [
      "Source",
      "CSV record",
      "Other CSV record",
      "Line number",
      "Field",
      "Check",
      "Line list value",
      "Drawing record value",
      "Finding",
      "Compared fields",
    ],
    ...report.findings.map((r) => [
      lineSources[r.source],
      r.row,
      r.otherRow ?? "",
      r.line,
      r.field,
      r.code,
      r.listed,
      r.observed,
      r.detail,
      report.comparedFields.map((f) => lineLabels[f]).join("; ") ||
        "Identity only",
    ]),
    ...(report.findings.length
      ? []
      : [
          [
            "Summary",
            "",
            "",
            "",
            "",
            "no-record-discrepancies",
            "",
            "",
            "No discrepancies in supplied records. Drawing extraction, connectivity, units and engineering approval not verified.",
            report.comparedFields.map((f) => lineLabels[f]).join("; ") ||
              "Identity only",
          ],
        ]),
  ]);
}
export const lineSamples = {
  register:
    "Line number,From,To,Size,Piping class,Service\nL-001,TK-100,V-101,DN25,SS-A,N2\nL-002,V-101,PT-101,DN15,SS-A,N2\nL-003,PT-101,OUT-1,DN15,SS-A,N2\n",
  drawing:
    "Line number,From,To,Size,Piping class,Service\nL-001,TK-100,V-101,DN20,SS-A,N2\nL-002,V-101,PT-999,DN15,SS-A,N2\nL-004,PT-101,OUT-1,DN15,SS-A,N2\n",
};
