# MST Mechanical Design Tools

Free tools for mechanical engineers, used directly on [mst-us.ai](https://mst-us.ai/tools/).

| Tool               | What it finishes                                                                                               | Online                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| P&ID Tag Check     | Read printed tags, correct the list and compare it with reference tags                                         | [Use P&ID Tag Check](https://mst-us.ai/tools/pid-tag-check/)          |
| BOM Compare        | Compare two CSV revisions by part number, review changes, export the difference                                | [Use BOM Compare](https://mst-us.ai/tools/bom-compare/)               |
| Drawing to BOM     | Read an existing parts table from an image or PDF, edit the rows, export CSV                                   | [Use Drawing to BOM](https://mst-us.ai/tools/drawing-to-bom/)         |
| BOM Check          | Find missing values and conflicting or repeated parts, edit without losing custom columns, export reviewed CSV | [Use BOM Check](https://mst-us.ai/tools/bom-check/)                   |
| Title Block Reader | Read labelled drawing fields, review sheets, export a drawing register                                         | [Use Title Block Reader](https://mst-us.ai/tools/title-block-reader/) |

No account, API key or installation is needed for the hosted tools. Source code is open under the MIT license.

## Start with a worked example

- **P&ID list reconciliation:** in [P&ID Tag Check](https://mst-us.ai/tools/pid-tag-check/#pid-example), select **Try a sample**, then **Read text**. Review the tags against the drawing and confirm the checkbox. Select **Use sample reference**, then **Compare tags**. Expect three identifiers on both lists, `XV-104` only in the drawing and `TT-103` only in the reference. `PT-101` appears twice on the drawing and once in the reference; these are printed occurrences, not equipment quantities. Export the comparison to inspect the complete result.
- **BOM revision review:** in [BOM Compare](https://mst-us.ai/tools/bom-compare/#bom-example), select **Try sample revisions**, or download [revision A](https://mst-us.ai/tools/samples/bom-revision-a.csv) and [revision B](https://mst-us.ai/tools/samples/bom-revision-b.csv) and open them in the corresponding inputs. Confirm the column mapping and select **Compare BOMs**. Expect one added part, one removed part, two changed parts (material and quantity), and one unchanged part. Export the CSV to review all differences.

Both examples use synthetic data. Their illustrated guides describe expected findings; the tool computes actual results from the reviewed inputs. They are not customer cases or general-accuracy benchmarks.

## Drawing to BOM

1. Select a PNG, JPEG or PDF (up to 25 MB), or try the included synthetic example.
2. Choose the PDF page and crop around the table, including the headers.
3. Extract, review and correct the rows, then download a UTF-8 CSV for Excel or Google Sheets.

This version extracts an **existing printed BOM or parts list**. It does not infer components from geometry, reconstruct assembly structure or guess missing quantities. OCR can confuse similar characters, split wrapped descriptions or assign text to the wrong column. The drawing remains visible for checking. Merged cells, rotated tables and low-resolution scans may need manual correction.

English and Simplified Chinese recognition are available. Header mapping recognizes common English and Chinese names for item, part number, description, quantity and material. Language coverage is not a claim of general drawing accuracy.

## BOM Compare

Load or paste two CSV/TSV files with a header row. Map the part-number and quantity columns; description and material are optional. Matching uses exact, trimmed, **case-sensitive** part numbers. Item order is ignored.

Duplicate or missing part numbers stop comparison. Quantities must be non-negative decimal numbers (at most 1 billion, with up to 6 decimal places), using a dot and no units or thousands separators. The tool does not convert units, aggregate duplicate rows or compare nested assembly structures. A changed part number appears as a removal and an addition. Formula-like exported cells are prefixed with an apostrophe for spreadsheet safety.

## BOM Check

Load a UTF-8 CSV/TSV (up to 4 MB, 10,000 data rows and 100 columns) and confirm the column mapping. Review missing values, invalid quantities, outer whitespace and repeated part numbers. All original columns, including units and revisions, stay editable and are retained in the export. Source row numbers refer to parsed data records after the header, not physical lines in a file with multiline cells. Formula-like cells are escaped in exports.

Rows are never combined automatically. A preview adds quantities only when every other column matches after trimming, except the mapped item number. Different materials, units, revisions or custom fields block combining. Combining keeps the first item label; remove accidental duplicate rows instead of adding their quantities. Undo retains the last ten editing operations. The review checkbox permits export with unresolved values exactly as shown; it is not engineering approval. This is a flat-BOM data check, without unit conversion or assembly interpretation.

## Title Block Reader

Choose up to ten PNG/JPEG/PDF files (25 MB each, 100 MB total), select a PDF page and crop around its title block. Read drawing number, title, revision, material, scale and sheet labels, correct the fields, then add the reviewed sheet to a register. Export a CSV with source filenames and PDF page numbers. Files and pages are reviewed one at a time, not processed as an unattended batch. Export before refreshing or leaving.

Suggestions require a recognizable English or Chinese label and its value on the same line. Repeated conflicting labels stay blank. Other layouts need manual entry after reading. OCR can confuse `O` and `0`, miss fields or include nearby text; every field needs source review. Title-block material is not the material of every part in an assembly.

## P&ID Tag Check

Read a cropped drawing and configure the letter prefixes used by your project. Check the suggested tags, add any missed occurrences and compare with a pasted list or a UTF-8 reference CSV containing one `Tag` column. Download the matched, drawing-only and reference-only tags, with occurrence counts. A manual list can also be used without OCR. Reference files are limited to 1 MB and 10,000 entries.

This version supports tags such as `PT-101`, `P-002A` and `TK-12`: one letter prefix, one numeric sequence and an optional letter suffix. Leading zeros are preserved. Comparison normalizes letter case and spaces around hyphens. Split, rotated, symbol-enclosed and project-specific multipart tags may be missed or unsupported. Repeated symbols are counted as text occurrences, not equipment quantities. The tool checks the reviewed lists; it does not validate piping connections, process safety or physical layout.

## Privacy

Selected files and recognized content are handled in browser memory. No upload API, inference service, document logging or file persistence is used. The MST-hosted site sends one same-origin page-view event containing only the public tool path, source category and random event ID. The server derives a daily salted visit identifier; it never receives tool inputs or file contents through this collector. Internal/QA events are excluded from audience totals; GPC and DNT disable it. The hosted Privacy Notice describes the 35-day event retention. Optional Google Analytics is not loaded on tool pages. Refreshing clears the working files and results. Recognition workers and language models are served from the same website. The hosting server can receive ordinary page/asset request metadata, but not drawing/BOM contents.

The hosted pages set a restrictive content policy for scripts, workers and connections. Do not add third-party analytics or remote inference while retaining this local-processing claim.

## Develop

Requires Node.js 24 or newer.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run preview
```

Open `http://127.0.0.1:4173/tools/`. Development mode is available with `npm run dev`; the production build provides prerendered HTML and self-hosted worker/model assets.

```sh
npx playwright install chromium webkit
npm run test:e2e
```

CI verifies real image/PDF OCR, editable CSV output, revision differences, conservative BOM combining, drawing registers, exact tag reconciliation, cancellation and invalid input, desktop/mobile layout, JavaScript-free discovery and document-upload absence. Browser console failures are checked; known Tesseract diagnostics about tiny symbol fragments in the P&ID fixture are retained separately in evidence, with all expected tag values still asserted. Fixtures are synthetic and are not customer drawings. Passing these examples is not a benchmark of arbitrary drawing accuracy.

To run the same browser verification against an existing release, set `MST_TOOLS_BASE_URL=https://mst-us.ai` before `npm run test:e2e`. These flows process synthetic files in the browser and download local CSVs; they do not submit customer data or create server records.

## Architecture and release

React/TypeScript provides the interface. [PDF.js](https://mozilla.github.io/pdf.js/) renders a selected PDF page. [Tesseract.js](https://github.com/naptha/tesseract.js) runs OCR in a local worker. Long table rules are removed from a temporary recognition image; the source preview remains intact. Word positions and recognizable headers map text into reviewable rows. CSV parsing and revision comparison are deterministic.

`npm run build` produces a static `dist/` directory for mounting at `/tools/`, plus an SHA-256 file manifest in `release.json` and a small sitemap. Dependencies are pinned by `package-lock.json`. Publish only an artifact from a successful main-branch verification run, keep the prior directory for rollback, and verify the public tools after promotion. The application needs no database or server-side file-processing endpoint.

The website's main navigation is maintained separately. Publishing this repository does not by itself change the website theme.

## Contribute

Specific engineering problems, reproducible synthetic examples and PRs are welcome. Do not post customer drawings, proprietary part lists or credentials in public issues. Contact [MST for collaboration](https://mst-us.ai/contact/?intent=partner#partnerships).

MST's [Mechanical Assembly AI](https://mst-us.ai/product/) addresses a separate P&ID-to-equipment-assembly workflow. These utilities do not contain that product engine.

## License

[MIT](LICENSE) for MST tool code and synthetic examples. Runtime libraries and language data retain their original licenses. The build bundles third-party notices at `/tools/licenses.html` and `/tools/THIRD_PARTY_NOTICES.txt`.
