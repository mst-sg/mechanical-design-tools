// Server-rendered copy for the two primary free-tool entry pages. Every claim
// here is limited to behaviour implemented in src/DrawTool.tsx, src/files.ts,
// src/bom-workbook.ts, src/CompareTool.tsx and src/compare.ts. The same FAQ
// array feeds both the visible text and the FAQPage JSON-LD.
export type Faq = { q: string; a: string };
export type Section =
  | { heading: string; id: string; paragraphs: string[] }
  | { heading: string; id: string; list: string[]; ordered?: boolean }
  | { heading: string; id: string; io: [string, string][] };
export type ToolPage = {
  seoTitle: string;
  description: string;
  h1: string;
  handbook: string;
  applicationName: string;
  sections: Section[];
  faq: Faq[];
  related: { href: string; label: string }[];
};

export const toolPages: Record<string, ToolPage> = {
  "drawing-to-bom": {
    seoTitle:
      "Drawing to BOM \u2013 Free Tool to Extract a BOM from a PDF or Image | MST",
    description:
      "Free Drawing to BOM tool: read the parts table in a PNG, JPEG or PDF drawing, review and correct each row, then export Excel or CSV.",
    h1: "Drawing to BOM",
    handbook: "drawing-bom",
    applicationName: "MST Drawing to BOM",
    sections: [
      {
        heading: "What Drawing to BOM does",
        id: "what-it-does",
        paragraphs: [
          "Drawing to BOM reads the parts table that is already printed on an engineering drawing and turns it into an editable bill of materials (BOM). You choose the drawing page, crop around the table, and MST\u2019s OCR service returns the rows it can read. You then correct them in the browser and export the result.",
          "It reads an existing table. It does not invent a BOM from geometry: a drawing with no parts table needs a separately authored parts list.",
        ],
      },
      {
        heading: "Inputs and outputs",
        id: "inputs-outputs",
        io: [
          [
            "Input",
            "One PNG, JPEG or PDF drawing, up to 25 MB. For a PDF you pick the page; you then crop around the parts table including its column headings.",
          ],
          [
            "Output",
            "An editable table with Item, Part number, Description, Quantity and Material columns. Export it as an Excel workbook (.xlsx) or as a CSV file.",
          ],
        ],
      },
      {
        heading: "How to extract a BOM from a drawing, step by step",
        id: "steps",
        ordered: true,
        list: [
          "Choose a PNG, JPEG or PDF drawing, or select \u201cTry a sample\u201d to see the workflow first.",
          "For a PDF, select the page that carries the parts table.",
          "Drag the crop box around the parts table. Include the column headings and leave unrelated dimensions and notes outside the crop.",
          "Select \u201cExtract BOM\u201d. The drawing is uploaded to MST\u2019s private GPU service for recognition; you can watch progress and cancel.",
          "Check every returned row against the drawing: part numbers character by character, quantities and materials. Rows with a low OCR confidence label are flagged for review.",
          "Edit any wrong cell, then export Excel (.xlsx) or CSV.",
        ],
      },
      {
        heading: "Supported file formats",
        id: "formats",
        list: [
          "Drawing input: PNG, JPEG (.jpg, .jpeg) and PDF. The file type is checked from the file itself, and the maximum file size is 25 MB.",
          "PDF: unencrypted PDFs of up to 500 pages; one page and one crop are read at a time.",
          "Images: up to 60 megapixels. Export a smaller crop if an image is larger.",
          "Output: Excel (.xlsx, up to 500 rows) and CSV.",
          "Not read directly: DWG, DXF or native SOLIDWORKS files. Export the drawing sheet that carries the parts table to PDF or PNG first.",
        ],
      },
      {
        heading: "Limits to know before you rely on the result",
        id: "limits",
        list: [
          "OCR can misread characters, for example the letter O and the digit 0. Treat every row as a draft until you have checked it. A confidence label is a prompt for review, not proof of engineering correctness.",
          "It reads a parts table that is already on the drawing. Missing geometry or hidden components are not inferred.",
          "Your original file and the recognized result are stored privately by MST. You can delete the server files from the tool; the handbook explains saved uploads and private receipts.",
        ],
      },
    ],
    faq: [
      {
        q: "What does the Drawing to BOM tool do?",
        a: "It reads the parts table printed on a PNG, JPEG or PDF drawing and returns the rows in an editable table. You review and correct the rows, then export them as Excel (.xlsx) or CSV.",
      },
      {
        q: "Is Drawing to BOM free?",
        a: "Yes. Drawing to BOM is one of MST\u2019s free engineering tools. You can try the built-in sample first.",
      },
      {
        q: "Which file formats can I upload?",
        a: "PNG, JPEG and PDF, up to 25 MB per file. PDFs can have up to 500 pages and you choose the page to read. DWG, DXF and native SOLIDWORKS files are not read directly; export the drawing sheet to PDF or PNG first.",
      },
      {
        q: "What formats can I export?",
        a: "Excel (.xlsx, up to 500 rows) and CSV. The columns are Item, Part number, Description, Quantity and Material.",
      },
      {
        q: "Does it work on a drawing that has no parts table?",
        a: "No. The tool reads a table that is already printed on the drawing. It does not infer components from geometry, so a drawing without a table needs a separately authored parts list.",
      },
      {
        q: "How accurate is the extraction?",
        a: "OCR can misread characters, so the result is a draft. Check every row against the drawing, especially part numbers and quantities. MST does not publish an accuracy figure for this free tool.",
      },
      {
        q: "What happens to my drawing?",
        a: "When you choose Extract BOM, the original file is uploaded to MST\u2019s private GPU service and stored with the recognized result. You can cancel processing and delete the server files from the tool. MST states on the tool page that uploaded files are not used for model training.",
      },
      {
        q: "How do I compare two versions of a BOM?",
        a: "Export both revisions as CSV and use the free BOM Compare tool, which lists added, removed and changed parts.",
      },
    ],
    related: [
      { href: "/tools/bom-compare/", label: "BOM Compare (free)" },
      { href: "/tools/bom-check/", label: "BOM CSV Checker" },
      {
        href: "/tools/handbook/#drawing-bom",
        label: "Handbook: Drawing to BOM",
      },
      { href: "/tools/", label: "All free tools" },
    ],
  },
  "bom-compare": {
    seoTitle: "BOM Compare \u2013 Free Tool to Compare Two BOM Revisions | MST",
    description:
      "Free BOM Compare tool: load two CSV or TSV BOM revisions, match them by part number and see added, removed and changed parts. Export the result as CSV.",
    h1: "BOM Compare",
    handbook: "revisions",
    applicationName: "MST BOM Compare",
    sections: [
      {
        heading: "What BOM Compare does",
        id: "what-it-does",
        paragraphs: [
          "BOM Compare takes two revisions of a bill of materials (BOM) and shows what changed between them. Parts are matched by part number, and each part is marked Added, Removed, Changed or Unchanged, so you can see the effect of a revision before you update an assembly or place an order.",
          "It compares flat tables. It does not compare CAD geometry, rebuild assembly hierarchy or approve substitutions.",
        ],
      },
      {
        heading: "Inputs and outputs",
        id: "inputs-outputs",
        io: [
          [
            "Input",
            "A \u201cBefore\u201d and an \u201cAfter\u201d BOM, each a UTF-8 CSV or TSV file of up to 4 MB, or pasted CSV text. The first row is the header; you map the columns to Part number and Quantity (required) and Item, Description and Material (optional).",
          ],
          [
            "Output",
            "A filterable comparison table with the status of every part, the quantity change (After minus Before) and the fields that changed. Export it as a CSV file.",
          ],
        ],
      },
      {
        heading: "How to compare two BOM revisions, step by step",
        id: "steps",
        ordered: true,
        list: [
          "Export each BOM revision from your CAD, PDM or spreadsheet as CSV (UTF-8). In Excel, use \u201cCSV UTF-8\u201d.",
          "Choose the Before file and the After file, or paste the CSV text. You can also select \u201cTry sample revisions\u201d.",
          "Confirm the column mapping on both sides. Part number and Quantity must be mapped.",
          "Select \u201cCompare BOMs\u201d.",
          "Filter by Added, Removed, Changed or Unchanged, and read the quantity change and changed fields for each part.",
          "Select \u201cExport comparison\u201d to download the result as CSV, then review the change against your drawing change record before purchasing or assembly.",
        ],
      },
      {
        heading: "How parts are matched",
        id: "matching",
        list: [
          "Added: the part number appears only in the After BOM. Removed: it appears only in the Before BOM.",
          "Changed: the part number is in both BOMs and its quantity, description or material differs. Unchanged: all three match.",
          "Part numbers are matched exactly and are case-sensitive. A part that shows as both removed and added is often a whitespace, case or O/0 difference.",
          "Each part number must appear once per BOM. The tool stops and names the duplicate so you can combine or distinguish the rows first.",
          "Quantities must be plain non-negative numbers with a dot decimal separator, up to six decimal places, with no units or thousands separators.",
        ],
      },
      {
        heading: "Supported file formats",
        id: "formats",
        list: [
          "CSV and TSV, UTF-8 encoded, up to 4 MB per file, or text pasted into the page.",
          "Excel workbooks are not read directly. Save the sheet as CSV UTF-8 first.",
          "Output: CSV (bom-comparison.csv).",
        ],
      },
    ],
    faq: [
      {
        q: "What does the BOM Compare tool do?",
        a: "It compares two BOM revisions by part number and lists the parts that were added, removed or changed, together with the quantity change. You can export the comparison as CSV.",
      },
      {
        q: "Is BOM Compare free?",
        a: "Yes. BOM Compare is one of MST\u2019s free engineering tools, and it includes sample revisions you can try first.",
      },
      {
        q: "Which file formats does BOM Compare accept?",
        a: "UTF-8 CSV and TSV files of up to 4 MB each, or pasted CSV text. Excel files are not read directly, so save the sheet as CSV UTF-8 first.",
      },
      {
        q: "Which fields are compared?",
        a: "Parts are matched by part number. For parts present in both BOMs, the tool compares quantity, description and material. Map the Description and Material columns on both sides if you want those changes shown.",
      },
      {
        q: "Why does a part appear as both removed and added?",
        a: "Part numbers are matched exactly and are case-sensitive. Check for extra spaces, different capitalization, or the letter O versus the digit 0 in the identifier.",
      },
      {
        q: "Why does the tool refuse my file?",
        a: "The usual causes are a duplicate part number within one BOM, a missing part number, a quantity with units or a thousands separator, or a file that is not UTF-8. The message names the row or part so you can fix it.",
      },
      {
        q: "Does BOM Compare compare CAD models?",
        a: "No. It compares flat BOM tables only. It does not compare geometry, rebuild assembly hierarchy or approve part substitutions.",
      },
      {
        q: "How do I get a BOM out of a drawing first?",
        a: "Use the free Drawing to BOM tool to read the parts table from a PNG, JPEG or PDF drawing, then export it as CSV.",
      },
    ],
    related: [
      { href: "/tools/drawing-to-bom/", label: "Drawing to BOM (free)" },
      { href: "/tools/bom-check/", label: "BOM CSV Checker" },
      {
        href: "/tools/handbook/#revisions",
        label: "Handbook: revision comparison",
      },
      { href: "/tools/", label: "All free tools" },
    ],
  },
};
