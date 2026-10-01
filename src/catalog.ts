export const tools = [
  {
    slug: "line-list-check",
    name: "Line List Check",
    eyebrow: "LINE LIST + REVIEWED P&ID RECORDS → DISCREPANCIES",
    description: "Compare a line list with reviewed P&ID records. Find missing line numbers, duplicate identities and differences in endpoints, size, piping class or service. Review and export CSV.",
    subtitle: "Reconcile your line list with records checked against the P&ID.",
  },
  {
    slug: "delivery-package-check",
    name: "Delivery Package Check",
    eyebrow: "REQUIRED FILES + LOCAL FOLDER → HANDOFF REVIEW",
    description: "Check a drawing delivery manifest against selected local files. Find missing PDFs or STEP files, empty files and ambiguous names. Review and export findings without uploading documents.",
    subtitle: "Find missing drawing and model files before sending a delivery package.",
  },
  {
    slug: "connection-table-check",
    name: "Connection Table Check",
    eyebrow: "P&ID TAGS + FROM/TO CSV → REVIEW LIST",
    description: "Compare a connection table with reviewed P&ID tags and optional BOM assignments. Find missing endpoints, repeated pairs and unmapped tags. Export source-record findings.",
    subtitle: "Find disagreements between your P&ID tag list, connection table and BOM.",
  },
  {
    slug: "pid-tag-check",
    name: "P&ID Tag Check",
    eyebrow: "PRINTED TAGS → LIST COMPARISON",
    description:
      "Read and review tag text, then compare it with your equipment or instrument list. Export unmatched tags.",
    subtitle:
      "Compare reviewed P&ID tags with an equipment or instrument list.",
  },
  {
    slug: "bom-compare",
    name: "BOM Compare",
    eyebrow: "REVISION A → REVISION B",
    description:
      "Compare two CSVs by part number. Find added and removed parts, quantity changes and material updates.",
    subtitle: "See what changed between two bills of materials.",
  },
  {
    slug: "bom-model-check",
    name: "BOM–Model Check",
    eyebrow: "BOM + MODEL INDEX → HANDOFF REVIEW",
    description:
      "Match a BOM to model filenames and declared revisions. Find missing mappings, conflicting versions and files absent from your selection. Export a review list.",
    subtitle:
      "Check which parts are missing models before handing over an assembly.",
  },
  {
    slug: "drawing-to-bom",
    name: "Drawing to BOM",
    eyebrow: "DRAWING → SPREADSHEET",
    description:
      "Read an existing parts table from a PNG, JPEG or PDF. Review the rows and export CSV.",
    subtitle: "Turn a drawing’s parts table into an editable spreadsheet.",
  },
  {
    slug: "bom-check",
    name: "BOM Check",
    eyebrow: "EXPORTED DATA → REVIEWED BOM",
    description:
      "Check missing values, repeated parts and conflicting fields. Keep every column as you edit and export.",
    subtitle:
      "Find missing values, repeated parts and conflicting data before reusing a BOM.",
  },
  {
    slug: "title-block-reader",
    name: "Title Block Reader",
    eyebrow: "DRAWING SHEETS → REGISTER",
    description:
      "Read drawing numbers, titles and revisions. Check each sheet and export a drawing register.",
    subtitle:
      "Turn printed title-block information into a reviewed drawing register.",
  },
  {
    slug: "drawing-register-compare",
    name: "Drawing Register Compare",
    eyebrow: "DRAWING SET A → DRAWING SET B",
    description:
      "Find added, removed and changed drawing sheets by drawing number and sheet. Compare revision labels and export a review list.",
    subtitle: "Check which drawing sheets changed before handoff.",
  },
];
