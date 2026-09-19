import { type BomField, type BomRow, fields, labels } from "./types";
export const MAX_ROWS = 10000;
export function parseCsv(source: string): string[][] {
  if (source.length > 4_000_000)
    throw new Error("Use a CSV smaller than 4 MB.");
  const text = source.replace(/^\uFEFF/, "");
  if (!text.trim()) return [];
  // Sniff the separator outside quoted cells on the first record only.
  const candidates = [",", "\t", ";"];
  const counts = [0, 0, 0];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        i++;
        continue;
      }
      quoted = !quoted;
    }
    if (!quoted) {
      if (c === "\n" || c === "\r") break;
      const j = candidates.indexOf(c);
      if (j >= 0) counts[j]++;
    }
  }
  const sep = candidates[counts.indexOf(Math.max(...counts))];
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    inQuote = false,
    closed = false;
  const pushCell = () => {
    row.push(cell);
    cell = "";
    closed = false;
    if (row.length > 100) throw new Error("Use at most 100 columns.");
  };
  const pushRow = () => {
    pushCell();
    if (row.some((v) => v.trim())) rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS + 1)
      throw new Error("Use at most 10,000 BOM rows.");
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuote = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell.length || closed)
        throw new Error(
          "CSV contains an unexpected quote. Save it as UTF-8 CSV and try again.",
        );
      inQuote = true;
    } else if (c === sep) pushCell();
    else if (c === "\r" || c === "\n") {
      pushRow();
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else if (closed) {
      if (c !== " " && c !== "\t")
        throw new Error("CSV contains characters after a closing quote.");
    } else cell += c;
  }
  if (inQuote) throw new Error("CSV has an unclosed quoted cell.");
  if (cell || row.length || closed) pushRow();
  if (rows.length && rows.some((r) => r.length !== rows[0].length))
    throw new Error(
      "Rows have different column counts. Check the separator and quoted cells.",
    );
  return rows;
}
export function safeCell(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return `"${value}"`;
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))
    text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function toCsv(rows: unknown[][]): string {
  return "\uFEFF" + rows.map((r) => r.map(safeCell).join(",")).join("\r\n");
}
export function exportBom(rows: BomRow[]): string {
  return toCsv([
    fields.map((f) => labels[f]),
    ...rows.map((r) => fields.map((f) => r[f])),
  ]);
}
export function downloadCsv(text: string, name: string) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const aliases: Record<BomField, string[]> = {
  item: ["item", "itemno", "no", "number", "序号"],
  partNumber: [
    "partnumber",
    "partno",
    "pn",
    "mpn",
    "drawingno",
    "drawingnumber",
    "零件号",
    "图号",
  ],
  description: ["description", "partname", "name", "名称", "品名"],
  quantity: ["quantity", "qty", "count", "数量"],
  material: ["material", "materials", "材质", "材料"],
};
export function headerField(text: string): BomField | undefined {
  const key = text.toLowerCase().replace(/[\s._#:/()-]/g, "");
  return fields.find((f) => aliases[f].includes(key));
}
export type ColumnMap = Record<BomField, number>;
export function guessColumns(header: string[]): ColumnMap {
  const map: ColumnMap = {
    item: -1,
    partNumber: -1,
    description: -1,
    quantity: -1,
    material: -1,
  };
  header.forEach((h, i) => {
    const field = headerField(h);
    if (field && map[field] < 0) map[field] = i;
  });
  return map;
}
export function mappedRows(data: string[][], map: ColumnMap): BomRow[] {
  if (map.partNumber < 0 || map.quantity < 0)
    throw new Error(
      "Choose a part-number column and a quantity column for both revisions.",
    );
  const assigned = fields.map((f) => map[f]).filter((i) => i >= 0);
  if (new Set(assigned).size !== assigned.length)
    throw new Error("Map each source column to only one field.");
  return data.slice(1).map((cells, i) => ({
    id: String(i),
    item: cells[map.item]?.trim() ?? "",
    partNumber: cells[map.partNumber]?.trim() ?? "",
    description: cells[map.description]?.trim() ?? "",
    quantity: cells[map.quantity]?.trim() ?? "",
    material: cells[map.material]?.trim() ?? "",
  }));
}
export function quantityUnits(text: string): number | null {
  const t = text.trim();
  if (!/^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/.test(t)) return null;
  const [whole = "", fraction = ""] = t.split(".");
  const units =
    Number(whole || "0") * 1_000_000 + Number(fraction.padEnd(6, "0"));
  return Number.isSafeInteger(units) && units <= 1_000_000_000_000_000
    ? units
    : null;
}
export function numericQuantity(text: string): number | null {
  const units = quantityUnits(text);
  return units === null ? null : units / 1_000_000;
}
