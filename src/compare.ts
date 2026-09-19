import { quantityUnits } from "./csv";
import { type BomRow } from "./types";
export type DiffStatus = "Added" | "Removed" | "Changed" | "Unchanged";
export type DiffRow = {
  key: string;
  status: DiffStatus;
  before?: BomRow;
  after?: BomRow;
  delta: number;
  changes: string[];
};
export function compareBoms(before: BomRow[], after: BomRow[]): DiffRow[] {
  function index(rows: BomRow[], label: string) {
    const map = new Map<string, BomRow>();
    for (const [i, row] of rows.entries()) {
      const key = row.partNumber.trim();
      if (!key)
        throw new Error(`${label}, row ${i + 2}: part number is missing.`);
      if (map.has(key))
        throw new Error(
          `${label}: duplicate part number "${key}". Combine or distinguish duplicate rows before comparing.`,
        );
      if (quantityUnits(row.quantity) === null)
        throw new Error(
          `${label}, ${key}: quantity must be a non-negative decimal, at most 1 billion with up to 6 decimal places, without units or thousands separators.`,
        );
      map.set(key, row);
    }
    return map;
  }
  if (!before.length || !after.length)
    throw new Error("Each revision needs at least one data row.");
  const old = index(before, "Before"),
    next = index(after, "After");
  return [...new Set([...old.keys(), ...next.keys()])].map((key) => {
    const a = old.get(key),
      b = next.get(key),
      changes: string[] = [];
    if (a && b) {
      if (quantityUnits(a.quantity) !== quantityUnits(b.quantity))
        changes.push("Quantity");
      if (a.description !== b.description) changes.push("Description");
      if (a.material !== b.material) changes.push("Material");
    }
    return {
      key,
      before: a,
      after: b,
      status: !a
        ? "Added"
        : !b
          ? "Removed"
          : changes.length
            ? "Changed"
            : "Unchanged",
      delta:
        ((b ? quantityUnits(b.quantity)! : 0) -
          (a ? quantityUnits(a.quantity)! : 0)) /
        1_000_000,
      changes,
    };
  });
}
