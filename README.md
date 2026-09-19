# MST Mechanical Design Tools

Free tools for mechanical engineers, used directly on [mst-us.ai](https://mst-us.ai/tools/).

| Tool           | What it finishes                                                                | Online                                                        |
| -------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Drawing to BOM | Read an existing parts table from an image or PDF, edit the rows, export CSV    | [Use Drawing to BOM](https://mst-us.ai/tools/drawing-to-bom/) |
| BOM Compare    | Compare two CSV revisions by part number, review changes, export the difference | [Use BOM Compare](https://mst-us.ai/tools/bom-compare/)       |

No account, API key or installation is needed for the hosted tools. Source code is open under the MIT license.

## Drawing to BOM

1. Select a PNG, JPEG or PDF (up to 25 MB), or try the included synthetic example.
2. Choose the PDF page and crop around the table, including the headers.
3. Extract, review and correct the rows, then download a UTF-8 CSV for Excel or Google Sheets.

This version extracts an **existing printed BOM or parts list**. It does not infer components from geometry, reconstruct assembly structure or guess missing quantities. OCR can confuse similar characters, split wrapped descriptions or assign text to the wrong column. The drawing remains visible for checking. Merged cells, rotated tables and low-resolution scans may need manual correction.

English and Simplified Chinese recognition are available. Header mapping recognizes common English and Chinese names for item, part number, description, quantity and material. Language coverage is not a claim of general drawing accuracy.

## BOM Compare

Load or paste two CSV/TSV files with a header row. Map the part-number and quantity columns; description and material are optional. Matching uses exact, trimmed, **case-sensitive** part numbers. Item order is ignored.

Duplicate or missing part numbers stop comparison. Quantities must be non-negative decimal numbers (at most 1 billion, with up to 6 decimal places), using a dot and no units or thousands separators. The tool does not convert units, aggregate duplicate rows or compare nested assembly structures. A changed part number appears as a removal and an addition. Formula-like exported cells are prefixed with an apostrophe for spreadsheet safety.

## Privacy

Selected files and recognized content are handled in browser memory. No upload API, inference service, analytics, document logging or file persistence is used. Refreshing clears the working files and results. Recognition workers and language models are served from the same website. The hosting server can receive ordinary page/asset request metadata, but not drawing/BOM contents.

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

CI verifies real image/PDF OCR, editable CSV output, revision differences, invalid input, desktop/mobile layout, JavaScript-free discovery, console errors and document-upload absence. Fixtures are synthetic and are not customer drawings. Passing these examples is not a benchmark of arbitrary drawing accuracy.

## Architecture and release

React/TypeScript provides the interface. [PDF.js](https://mozilla.github.io/pdf.js/) renders a selected PDF page. [Tesseract.js](https://github.com/naptha/tesseract.js) runs OCR in a local worker. Long table rules are removed from a temporary recognition image; the source preview remains intact. Word positions and recognizable headers map text into reviewable rows. CSV parsing and revision comparison are deterministic.

`npm run build` produces a static `dist/` directory for mounting at `/tools/`, plus an SHA-256 file manifest in `release.json` and a small sitemap. Dependencies are pinned by `package-lock.json`. Publish only an artifact from a successful main-branch verification run, keep the prior directory for rollback, and verify the public tools after promotion. The application needs no database or server-side file-processing endpoint.

The website's main navigation is maintained separately. Publishing this repository does not by itself change the website theme.

## Contribute

Specific engineering problems, reproducible synthetic examples and PRs are welcome. Do not post customer drawings, proprietary part lists or credentials in public issues. Contact [MST for collaboration](https://mst-us.ai/contact/?intent=partner#partnerships).

MST's [Mechanical Assembly AI](https://mst-us.ai/product/) addresses a separate P&ID-to-equipment-assembly workflow. These utilities do not contain that product engine.

## License

[MIT](LICENSE) for MST tool code and synthetic examples. Runtime libraries and language data retain their original licenses. The build bundles third-party notices at `/tools/licenses.html` and `/tools/THIRD_PARTY_NOTICES.txt`.
