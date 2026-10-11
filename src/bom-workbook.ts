import ExcelJS from "exceljs";
import { numericQuantity } from "./csv";
import { fields, labels, type BomRow, type Crop } from "./types";

export type BomWorkbookSource = {
  filename?: string;
  page?: number;
  crop?: Crop;
  jobId?: string;
  engine?: string;
  text?: string;
  exportedAt?: Date;
};

function checkedText(value: string): string {
  if (value.length > 32767)
    throw new Error(
      "An Excel cell exceeds 32,767 characters. Shorten that cell before exporting.",
    );
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))
    throw new Error(
      "A cell contains an unsupported control character. Remove it before exporting.",
    );
  return value;
}

function textChunks(text: string): string[] {
  const chunks: string[] = [];
  let chunk = "";
  for (const character of text) {
    if (chunk.length + character.length > 32000) {
      chunks.push(checkedText(chunk));
      chunk = "";
    }
    chunk += character;
  }
  if (chunk) chunks.push(checkedText(chunk));
  return chunks;
}

export async function makeBomWorkbook(
  rows: BomRow[],
  source: BomWorkbookSource = {},
): Promise<Uint8Array<ArrayBuffer>> {
  if (!rows.length || rows.length > 500)
    throw new Error("Export between 1 and 500 BOM rows.");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MST Engineering Tools";
  workbook.created = source.exportedAt ?? new Date();
  workbook.modified = workbook.created;
  workbook.title = "Drawing BOM — draft for review";
  const sheet = workbook.addWorksheet("BOM", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    ...fields.map((field, index) => ({
      header: labels[field],
      key: field,
      width: [10, 25, 46, 15, 25][index],
    })),
    { header: "Review", key: "review", width: 54 },
  ];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const part = row.partNumber.trim();
    if (part) counts.set(part, (counts.get(part) ?? 0) + 1);
  }
  for (const row of rows) {
    fields.forEach((field) => checkedText(row[field]));
    const quantity = numericQuantity(row.quantity);
    const issues = [];
    if (!row.partNumber.trim()) issues.push("Check missing part number");
    if (quantity === null)
      issues.push("Check quantity; original text retained");
    if ((counts.get(row.partNumber.trim()) ?? 0) > 1)
      issues.push("Repeated part number; check quantity and configuration");
    if (row.confidence !== undefined && row.confidence < 75)
      issues.push("Check recognized text");
    // Plain string cell values, never formula/hyperlink objects: identifiers,
    // leading zeroes and formula-like user text must remain literal text.
    const added = sheet.addRow([
      row.item,
      row.partNumber,
      row.description,
      quantity ?? row.quantity,
      row.material,
      issues.join("; ") || "Verify against drawing",
    ]);
    for (const column of [1, 2, 3, 5, 6]) added.getCell(column).numFmt = "@";
    added.getCell(4).numFmt = quantity === null ? "@" : "0.######";
    added.alignment = { vertical: "top", wrapText: true };
    if (issues.length)
      added.getCell(6).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF0D2" },
      };
  }
  sheet.autoFilter = { from: "A1", to: "F1" };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF243B53" },
  };
  sheet.getRow(1).height = 25;

  const provenance = workbook.addWorksheet("Source and review");
  provenance.columns = [
    { header: "Field", width: 25 },
    { header: "Value", width: 100 },
  ];
  const crop = source.crop;
  const metadata: [string, string | number][] = [
    [
      "Status",
      "Draft containing the current editable rows. Verify against the source before ordering or changing an assembly.",
    ],
    ["Source file", source.filename || "Not available in this browser"],
    ["Source page", source.page ?? "Not available in this browser"],
    [
      "Crop (%)",
      crop
        ? `Left ${crop.left}, top ${crop.top}, width ${crop.width}, height ${crop.height}`
        : "Not available in this browser",
    ],
    ["Recognition", source.engine || "No recognition engine recorded"],
    ["Private job ID", source.jobId || "No server job linked"],
    ["Exported at (UTC)", workbook.created.toISOString()],
    ["Rows", rows.length],
    [
      "Review notes",
      "Edited cells are exported as currently shown. Missing values are not inferred; duplicate parts are not automatically merged. Review labels are checks, not engineering approval.",
    ],
  ];
  metadata.forEach(([key, value]) =>
    provenance.addRow([
      key,
      typeof value === "string" ? checkedText(value) : value,
    ]),
  );
  if (source.text)
    textChunks(source.text).forEach((chunk, index) =>
      provenance.addRow([`Recognized text ${index + 1}`, chunk]),
    );
  provenance.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
    row.getCell(2).numFmt = "@";
  });
  provenance.getRow(1).font = { bold: true };
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function downloadBomWorkbook(
  rows: BomRow[],
  source: BomWorkbookSource,
  onExport: () => void,
) {
  const bytes = await makeBomWorkbook(rows, source);
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "bom-draft.xlsx";
  document.body.append(link);
  try {
    link.click();
    onExport();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
