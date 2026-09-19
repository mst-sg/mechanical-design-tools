Engineers should be able to use free mechanical design utilities directly at https://mst-us.ai/tools/ without an account or installation.

Build two browser tools:

- Drawing to BOM: select a PNG, JPEG or PDF with an existing printed parts table, choose/crop the table, recognize it, review and edit rows, export UTF-8 CSV for Excel.
- BOM Compare: load or paste two CSV revisions, map columns, flag added/removed/changed rows, export a comparison.

Acceptance:

- Real image and PDF recognition; owned synthetic sample available.
- Files processed in browser memory, with self-hosted OCR assets and no file upload API.
- Clear scope: extracting an existing table, not inferring hidden components from geometry.
- Accessible desktop/mobile UI, keyboard controls, loading/cancel/recovery, editable results.
- Robust quoted CSV parsing, explicit duplicate-key handling, quantity validation and spreadsheet-safe exports.
- Typecheck, unit checks, build and real browser tests before release.
- Public source, dependency attribution, concise usage instructions and stable on-site links.

Implementation decisions:

- Existing printed tables are the extraction scope. OCR and deterministic header/geometry mapping produce drafts for review; no missing quantity is fabricated.
- Selected files remain in browser memory. Recognition assets are self-hosted and connections restricted to the same origin. No telemetry contains input or output data.
- The owned sample drawing is clearly marked synthetic and not for manufacture. PNG and raster PDF exercise the actual recognition path.
- Desktop preview/result columns stack on mobile. Tables intentionally scroll horizontally; all editable cells and mappings have accessible names.
- Empty, loading, cancellation, decoding failure, unrecognized headers, invalid CSV/quantity, duplicates and no-change paths are visible.
- Self-review risks addressed: oversized marketing hero (task first); fake AI (actual OCR); false certainty (source preview and review); crowded mobile data (bounded scrolling); mixed semiconductor positioning (mechanical utilities only).
- Component tree: ToolShell -> DrawingToBom (file/page/crop, OCR progress, editable rows/export) or BomCompare (two revision inputs, mappings, diff table/export) -> related tools/guide/source links.
