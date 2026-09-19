import { quantityUnits, type ColumnMap } from "./csv";
export type SourceRow = { id: string; source: number[]; cells: string[] };
export type BomIssue = {
  row: string;
  source: number[];
  part: string;
  kind: string;
  detail: string;
};
export type PartGroup = {
  part: string;
  ids: string[];
  source: number[];
  total: string | null;
  reason: string;
};
export function sourceRows(data: string[][]): SourceRow[] {
  return data
    .slice(1)
    .map((cells, i) => ({ id: `r${i}`, source: [i + 1], cells: [...cells] }));
}
export function validateMap(header: string[], map: ColumnMap) {
  if (map.partNumber < 0 || map.quantity < 0)
    throw new Error("Choose the part-number and quantity columns.");
  const selected = Object.values(map).filter((i) => i >= 0);
  if (selected.some((i) => !Number.isInteger(i) || i >= header.length))
    throw new Error("Choose columns from this CSV.");
  if (new Set(selected).size !== selected.length)
    throw new Error("Map each source column to only one field.");
}
function decimal(units: bigint) {
  const fraction = (units % 1000000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return (units / 1000000n).toString() + (fraction ? "." + fraction : "");
}
export function auditBom(header: string[], rows: SourceRow[], map: ColumnMap) {
  validateMap(header, map);
  const issues: BomIssue[] = [],
    byPart = new Map<string, SourceRow[]>();
  const add = (r: SourceRow, kind: string, detail: string) =>
    issues.push({
      row: r.id,
      source: r.source,
      part: r.cells[map.partNumber]?.trim() || "",
      kind,
      detail,
    });
  for (const r of rows) {
    const part = r.cells[map.partNumber]?.trim() || "",
      qty = r.cells[map.quantity] || "";
    if (!part)
      add(r, "Missing part number", "Enter a part number or remove this row.");
    else {
      const group = byPart.get(part);
      if (group) group.push(r);
      else byPart.set(part, [r]);
    }
    if (!qty.trim())
      add(r, "Missing quantity", "Enter a quantity; a blank is not zero.");
    else if (quantityUnits(qty) === null)
      add(
        r,
        "Invalid quantity",
        "Use a non-negative decimal up to 1 billion with at most 6 decimal places. Keep units in a separate column.",
      );
    else if (quantityUnits(qty) === 0)
      add(r, "Zero quantity", "Confirm that zero is intentional.");
    for (const field of ["description", "material"] as const) {
      if (map[field] >= 0 && !r.cells[map[field]]?.trim())
        add(
          r,
          `Missing ${field}`,
          `The mapped ${field} field is empty. Review or leave blank intentionally.`,
        );
    }
    const spaces = r.cells.flatMap((c, i) =>
      c !== c.trim() ? [header[i] || `Column ${i + 1}`] : [],
    );
    if (spaces.length) add(r, "Outer whitespace", spaces.join(", "));
  }
  const groups: PartGroup[] = [];
  for (const [part, group] of byPart) {
    if (group.length < 2) continue;
    const metadata = group.map((r) =>
      JSON.stringify(
        r.cells.map((c, i) =>
          [map.item, map.quantity, map.partNumber].includes(i)
            ? null
            : c.trim(),
        ),
      ),
    );
    const conflict = new Set(metadata).size > 1;
    const quantities = group.map((r) =>
      quantityUnits(r.cells[map.quantity] || ""),
    );
    const sum = quantities.every((q) => q !== null)
      ? quantities.reduce<bigint>((n, q) => n + BigInt(q!), 0n)
      : null;
    const reason = conflict
      ? "Other columns differ, including any custom columns or units. Edit or keep these rows separate."
      : sum === null
        ? "Fix invalid or missing quantities before combining."
        : sum > 1000000000000000n
          ? "Combined quantity exceeds 1 billion. Keep the rows separate."
          : "All columns except item and quantity match after trimming outer whitespace. Combine only if these are separate occurrences to total.";
    for (const r of group)
      add(
        r,
        conflict ? "Conflicting part number" : "Repeated part number",
        reason,
      );
    groups.push({
      part,
      ids: group.map((r) => r.id),
      source: group.flatMap((r) => r.source),
      total:
        !conflict && sum !== null && sum <= 1000000000000000n
          ? decimal(sum)
          : null,
      reason,
    });
  }
  return { issues, groups };
}
export function combinePart(
  header: string[],
  rows: SourceRow[],
  map: ColumnMap,
  part: string,
): SourceRow[] {
  const group = auditBom(header, rows, map).groups.find((g) => g.part === part);
  if (!group || group.total === null)
    throw new Error(
      "These rows cannot be combined. Review their quantities and other columns.",
    );
  const first = rows.find((r) => r.id === group.ids[0])!;
  const cells = [...first.cells];
  const members = new Set(group.ids);
  cells[map.partNumber] = part;
  cells[map.quantity] = group.total;
  return rows.flatMap((r) =>
    r.id === first.id
      ? [{ ...r, source: group.source, cells }]
      : members.has(r.id)
        ? []
        : [r],
  );
}
