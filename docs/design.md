Engineers should be able to use free mechanical design utilities directly at https://mst-us.ai/tools/ without an account or installation.

Build two browser tools:

- Drawing to BOM: select a PNG, JPEG or PDF with an existing printed parts table, choose/crop the table, recognize it, review and edit rows, export UTF-8 CSV for Excel.
- BOM Compare: load or paste two CSV revisions, map columns, flag added/removed/changed rows, export a comparison.

Acceptance:

- Real image and PDF recognition; owned synthetic sample available.
- Drawing-to-BOM uses private, temporary same-origin server jobs; other tools process files in browser memory.
- Clear scope: extracting an existing table, not inferring hidden components from geometry.
- Accessible desktop/mobile UI, keyboard controls, loading/cancel/recovery, editable results.
- Robust quoted CSV parsing, explicit duplicate-key handling, quantity validation and spreadsheet-safe exports.
- Typecheck, unit checks, build and real browser tests before release.
- Public source, dependency attribution, concise usage instructions and stable on-site links.

Implementation decisions:

- Existing printed tables are the extraction scope. OCR and deterministic header/geometry mapping produce drafts for review; no missing quantity is fabricated.
- Drawing-to-BOM sends the explicitly selected original file to its same-origin job service; it expires within 24 hours or on user deletion. Other tools retain browser-only processing. Operational telemetry contains no input/output content.
- The owned sample drawing is clearly marked synthetic and not for manufacture. PNG and raster PDF exercise the actual recognition path.
- Desktop preview/result columns stack on mobile. Tables intentionally scroll horizontally; all editable cells and mappings have accessible names.
- Empty, loading, cancellation, decoding failure, unrecognized headers, invalid CSV/quantity, duplicates and no-change paths are visible.
- Self-review risks addressed: oversized marketing hero (task first); fake AI (actual OCR); false certainty (source preview and review); crowded mobile data (bounded scrolling); mixed semiconductor positioning (mechanical utilities only).
- Component tree: ToolShell -> DrawingToBom (file/page/crop, OCR progress, editable rows/export) or BomCompare (two revision inputs, mappings, diff table/export) -> related tools/guide/source links.
