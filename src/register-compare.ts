import { parseCsv, toCsv } from "./csv";

export type RegisterRow = {
  drawing: string;
  sheet: string;
  revision: string;
  title: string;
};
export type RegisterDiff = {
  drawing: string;
  sheet: string;
  status: "Added" | "Removed" | "Changed" | "Unchanged";
  before?: RegisterRow;
  after?: RegisterRow;
};
const aliases = [
  ["drawing", "drawing number", "drawing no"],
  ["sheet", "sheet number"],
  ["revision", "rev"],
  ["title", "description"],
];
export function readRegister(text: string): RegisterRow[] {
  const data = parseCsv(text);
  if (data.length < 2)
    throw new Error("Include a header and at least one drawing sheet.");
  const header = data[0].map((x) => x.trim().toLowerCase());
  const columns = aliases.map((names) => {
    const matches = header.flatMap((h, i) => (names.includes(h) ? [i] : []));
    if (matches.length !== 1)
      throw new Error(
        `Include exactly one ${names[0]} column. Download the template for the expected headings.`,
      );
    return matches[0];
  });
  const seen = new Set<string>();
  return data.slice(1).map((cells, i) => {
    const [drawing, sheet, revision, title] = columns.map((c) =>
      cells[c].trim(),
    );
    if (!drawing || !sheet || !revision)
      throw new Error(
        `Data row ${i + 1}: drawing, sheet and revision are required. Enter an explicit initial revision if your policy uses one.`,
      );
    const key = JSON.stringify([drawing, sheet]);
    if (seen.has(key))
      throw new Error(
        `Data row ${i + 1}: duplicate drawing and sheet. Resolve duplicates before comparing.`,
      );
    seen.add(key);
    return { drawing, sheet, revision, title };
  });
}
export function compareRegisters(
  before: string,
  after: string,
): RegisterDiff[] {
  const key = (r: RegisterRow) => JSON.stringify([r.drawing, r.sheet]);
  const left = new Map(readRegister(before).map((r) => [key(r), r]));
  const right = new Map(readRegister(after).map((r) => [key(r), r]));
  return [...new Set([...left.keys(), ...right.keys()])].map((k) => {
    const b = left.get(k),
      a = right.get(k),
      row = a ?? b!;
    return {
      drawing: row.drawing,
      sheet: row.sheet,
      before: b,
      after: a,
      status: !b
        ? "Added"
        : !a
          ? "Removed"
          : b.revision !== a.revision || b.title !== a.title
            ? "Changed"
            : "Unchanged",
    };
  });
}
export function exportRegisterDiff(rows: RegisterDiff[]): string {
  return toCsv([
    [
      "Drawing",
      "Sheet",
      "Status",
      "Before revision",
      "After revision",
      "Before title",
      "After title",
    ],
    ...rows.map((r) => [
      r.drawing,
      r.sheet,
      r.status,
      r.before?.revision ?? "",
      r.after?.revision ?? "",
      r.before?.title ?? "",
      r.after?.title ?? "",
    ]),
  ]);
}
