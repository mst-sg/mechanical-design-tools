import { parseCsv, toCsv } from "./csv";

export type ConnectionSource = "connections" | "tags" | "bom";
export type ConnectionField = "id" | "from" | "to" | "tag" | "part";
export type ConnectionInput = { text: string; map: Record<ConnectionField, number> };
export const sourceLabels = { connections: "Connections", tags: "Reviewed tags", bom: "BOM assignments" };
export const connectionFields: Record<ConnectionSource, ConnectionField[]> = {
  connections: ["from", "to", "id"], tags: ["tag"], bom: ["tag", "part"],
};
export const fieldLabels = { id: "Connection ID", from: "From tag", to: "To tag", tag: "Tag", part: "Part number" };
const aliases: Record<ConnectionField, string[]> = {
  id: ["id", "connectionid", "lineid"], from: ["from", "fromtag", "sourcetag"],
  to: ["to", "totag", "targettag", "destinationtag"], tag: ["tag", "equipmenttag", "instrumenttag"],
  part: ["partnumber", "partno", "pn", "mpn"],
};
export function connectionInput(text = ""): ConnectionInput {
  const map = { id: -1, from: -1, to: -1, tag: -1, part: -1 };
  let headers: string[] = [];
  try { headers = parseCsv(text)[0] ?? []; } catch { /* Show errors on check. */ }
  for (const field of Object.keys(map) as ConnectionField[]) {
    const hits = headers.flatMap((h, i) => aliases[field].includes(h.toLowerCase().replace(/[\s_.#-]/g, "")) ? [i] : []);
    if (hits.length === 1) map[field] = hits[0];
  }
  return { text, map };
}
type RecordRow = Record<ConnectionField, string> & { row: number };
function records(input: ConnectionInput, source: ConnectionSource): RecordRow[] {
  const data = parseCsv(input.text), fields = connectionFields[source];
  if (data.length < 2) throw new Error(`${sourceLabels[source]}: include a header and at least one data record.`);
  for (const field of fields) {
    const n = input.map[field];
    if (!Number.isInteger(n) || n < -1 || n >= data[0].length || (n === -1 && field !== "id"))
      throw new Error(`${sourceLabels[source]}: select the ${fieldLabels[field]} column.`);
  }
  const mapped = fields.map((f) => input.map[f]).filter((n) => n >= 0);
  if (new Set(mapped).size !== mapped.length) throw new Error(`${sourceLabels[source]}: map each column to only one field.`);
  return data.slice(1).map((cells, i) => ({
    row: i + 2, id: "", from: "", to: "", tag: "", part: "",
    ...Object.fromEntries(fields.map((f) => [f, (cells[input.map[f]] ?? "").trim()])),
  }));
}
export type ConnectionFinding = {
  source: ConnectionSource; row: number; code: string; id: string; from: string; to: string; tag: string; detail: string;
};
export type ConnectionReport = { connections: number; tags: number; bomChecked: boolean; findings: ConnectionFinding[] };
export function checkConnections(inputs: Record<ConnectionSource, ConnectionInput>): ConnectionReport {
  const edges = records(inputs.connections, "connections"), tags = records(inputs.tags, "tags");
  const bomChecked = Boolean(inputs.bom.text.trim()), bom = bomChecked ? records(inputs.bom, "bom") : [];
  const registry = new Map<string, RecordRow>();
  for (const tag of tags) {
    if (!tag.tag) throw new Error(`Reviewed tags: missing tag at record ${tag.row}. Resolve the reference before checking.`);
    if (registry.has(tag.tag)) throw new Error(`Reviewed tags: duplicate ${tag.tag} at records ${registry.get(tag.tag)!.row} and ${tag.row}. Use one reviewed row per tag.`);
    registry.set(tag.tag, tag);
  }
  function group(rows: RecordRow[], key: (r: RecordRow) => string) {
    const groups = new Map<string, number>();
    for (const r of rows) { const k = key(r); if (k) groups.set(k, (groups.get(k) ?? 0) + 1); }
    return groups;
  }
  const ids = group(edges, (r) => r.id), pairs = group(edges, (r) => r.from && r.to ? JSON.stringify([r.from, r.to]) : "");
  const assignments = group(bom, (r) => r.tag), used = new Set<string>();
  const findings: ConnectionFinding[] = [];
  function add(source: ConnectionSource, r: RecordRow, code: string, detail: string, tag = r.tag) {
    findings.push({ source, row: r.row, code, detail, id: r.id, from: r.from, to: r.to, tag });
  }
  for (const r of edges) {
    if (r.id && (ids.get(r.id) ?? 0) > 1) add("connections", r, "repeated-id", "Connection ID occurs more than once; check record identity.");
    if (inputs.connections.map.id >= 0 && !r.id) add("connections", r, "missing-id", "The mapped connection ID is empty.");
    for (const endpoint of ["from", "to"] as const) {
      const tag = r[endpoint];
      if (!tag) add("connections", r, "missing-endpoint", `${fieldLabels[endpoint]} is empty.`);
      else {
        used.add(tag);
        if (!registry.has(tag)) add("connections", r, "unknown-endpoint", `${fieldLabels[endpoint]} is absent from the reviewed tag registry.`, tag);
      }
    }
    if (r.from && r.to && r.from === r.to) add("connections", r, "self-pair", "Both endpoints name the same tag; verify the intended ports and line.");
    if (r.from && r.to && (pairs.get(JSON.stringify([r.from, r.to])) ?? 0) > 1)
      add("connections", r, "repeated-pair", "Directed tag pair occurs more than once. Check line/port records; parallel lines may be intentional.");
  }
  for (const r of tags) {
    if (!used.has(r.tag)) add("tags", r, "not-connected", "Tag has no endpoint in this table; confirm its scope or a missing connection.");
    if (bomChecked && !assignments.has(r.tag)) add("tags", r, "missing-bom-assignment", "No tag-to-part assignment supplied; confirm whether this tag requires a BOM item.");
  }
  for (const r of bom) {
    if (!r.tag) add("bom", r, "missing-bom-tag", "BOM assignment has no tag.");
    else if (!registry.has(r.tag)) add("bom", r, "bom-tag-outside-reference", "BOM tag is absent from the reviewed tag registry.");
    if (!r.part) add("bom", r, "missing-part", "BOM assignment has no part number.");
    if (r.tag && (assignments.get(r.tag) ?? 0) > 1) add("bom", r, "multiple-bom-assignments", "Several BOM rows use this tag; resolve the assignment scope before choosing a part.");
  }
  return { connections: edges.length, tags: tags.length, bomChecked, findings };
}
export function connectionReportCsv(report: ConnectionReport): string {
  return toCsv([
    ["Dataset", "CSV record", "Check", "Connection ID", "From tag", "To tag", "Tag", "Finding", "BOM assignments checked"],
    ...report.findings.map((r) => [sourceLabels[r.source], r.row, r.code, r.id, r.from, r.to, r.tag, r.detail, report.bomChecked ? "Yes" : "No"]),
    ...(report.findings.length ? [] : [["Summary", "", "no-list-discrepancies", "", "", "", "", "No discrepancies found in the supplied lists. Physical connectivity and engineering suitability were not checked.", report.bomChecked ? "Yes" : "No"]]),
  ]);
}
export const connectionSamples = {
  connections: "Connection ID,From tag,To tag\nC-01,V-101,F-999\nC-02,F-101,PT-101\nC-03,V-101,F-999\nC-04,PT-101,PT-101\nC-02,TK-101,\n",
  corrected: "Connection ID,From tag,To tag\nC-01,V-101,F-101\nC-02,F-101,PT-101\nC-03,PT-101,TK-101\nC-04,V-101,XV-104\nC-05,XV-104,TK-101\n",
  tags: "Tag\nV-101\nF-101\nPT-101\nTK-101\nXV-104\n",
  bom: "Tag,Part number\nV-101,\nPT-101,SENSOR-300\nTK-101,TANK-400\nXV-104,VALVE-500\nX-999,LEGACY-900\n",
  correctedBom: "Tag,Part number\nV-101,VALVE-100\nF-101,FLOW-200\nPT-101,SENSOR-300\nTK-101,TANK-400\nXV-104,VALVE-500\n",
};
