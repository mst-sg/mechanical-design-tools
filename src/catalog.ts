export const tools = [
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
