import { headerField } from "./csv";
import { type Word, type BomField, type BomRow, fields } from "./types";
export function wordsFromTsv(tsv: string): Word[] {
  return tsv
    .split(/\r?\n/)
    .slice(1)
    .flatMap((line) => {
      const c = line.split("\t");
      if (c[0] !== "5" || !c[11]?.trim()) return [];
      return [
        {
          text: c.slice(11).join("\t").trim(),
          x: Number(c[6]),
          y: Number(c[7]),
          width: Number(c[8]),
          height: Number(c[9]),
          confidence: Number(c[10]),
        },
      ];
    })
    .filter((w) =>
      [w.x, w.y, w.width, w.height, w.confidence].every(Number.isFinite),
    );
}
function linesFromWords(words: Word[]): Word[][] {
  const sorted = [...words].sort(
    (a, b) => a.y + a.height / 2 - (b.y + b.height / 2),
  );
  const lines: Word[][] = [];
  for (const word of sorted) {
    const center = word.y + word.height / 2;
    const line = lines.at(-1);
    if (line) {
      const avg =
        line.reduce((n, w) => n + w.y + w.height / 2, 0) / line.length;
      const h = Math.max(word.height, ...line.map((w) => w.height));
      if (Math.abs(avg - center) < h * 0.6) {
        line.push(word);
        continue;
      }
    }
    lines.push([word]);
  }
  return lines.map((l) => l.sort((a, b) => a.x - b.x));
}
export type Extraction = {
  rows: BomRow[];
  detected: BomField[];
  message: string;
};
export function extractTable(words: Word[]): Extraction {
  const lines = linesFromWords(words);
  let headerIndex = -1;
  let columns: { field: BomField; x: number }[] = [];
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const matches: { field: BomField; x: number }[] = [];
    for (let i = 0; i < line.length; i++)
      for (let count = Math.min(3, line.length - i); count >= 1; count--) {
        const phrase = line.slice(i, i + count);
        if (
          phrase.some(
            (w, j) =>
              j &&
              w.x - (phrase[j - 1].x + phrase[j - 1].width) >
                Math.max(w.height, 20) * 2.5,
          )
        )
          continue;
        const field = headerField(phrase.map((w) => w.text).join(" "));
        if (field && !matches.some((c) => c.field === field)) {
          matches.push({ field, x: phrase[0].x });
          i += count - 1;
          break;
        }
      }
    if (
      matches.some((c) => c.field === "quantity") &&
      matches.some(
        (c) => c.field === "partNumber" || c.field === "description",
      ) &&
      matches.length >= 2
    ) {
      columns = matches.sort((a, b) => a.x - b.x);
      headerIndex = n;
      break;
    }
  }
  if (headerIndex < 0)
    return {
      rows: [],
      detected: [],
      message:
        "No recognizable BOM header found. Crop tightly around a printed parts table with Description or Part number and Qty headers, then try again. You can also enter rows manually.",
    };
  const rows: BomRow[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const row: BomRow = {
      id: String(rows.length),
      item: "",
      partNumber: "",
      description: "",
      quantity: "",
      material: "",
      confidence: 100,
    };
    for (const word of line) {
      let col = columns[0];
      for (const c of columns)
        if (word.x >= c.x - Math.max(word.height * 0.8, 8)) col = c;
      row[col.field] += (row[col.field] ? " " : "") + word.text;
      row.confidence = Math.min(row.confidence!, word.confidence);
    }
    if (!row.partNumber && !row.description) continue;
    // A line without quantity can be a wrapped description or a drawing note. Keep it visible for review; never fabricate a quantity.
    if (fields.filter((f) => row[f]).length >= 2) rows.push(row);
    if (rows.length >= 500) break;
  }
  return {
    rows,
    detected: columns.map((c) => c.field),
    message: rows.length
      ? "Review every row against the drawing before using the CSV. OCR can misread part numbers, merge rows or shift columns."
      : "Headers found, but no rows could be read. Try a sharper crop or enter rows manually.",
  };
}
