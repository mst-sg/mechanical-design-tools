# Verification — initial release

Self-review by the implementing agent; no independent-review claim.

- `npm run typecheck`: passed.
- `npm test`: 10 focused checks passed, including quoted/multiline CSV, spreadsheet injection, duplicate keys, decimal quantity precision, header geometry and table-rule preprocessing.
- `npm run build`: three prerendered routes, self-hosted PDF/OCR assets and file hashes generated.
- Browser suite: nine executed cases passed; six explicitly redundant desktop-only cases skipped on mobile. Desktop Chrome, mobile Chrome and mobile WebKit cover real PNG recognition and comparison. The PDF rendering/recognition, invalid file recovery, no-JavaScript HTML and cancellation recovery cases run on desktop.
- Synthetic sample: five part numbers and quantities extracted through real OCR, with no precomputed result. A changed quantity survives CSV export.
- Checks observe page errors, browser-console errors, failed HTTP responses, unexpected network destinations and write methods. No document upload or external processing endpoint is used.
- Mobile overflow found in Safari was fixed by containing off-screen table labels in the table's own scroll area. Touch inputs use a readable 16px font.
- Long table rules initially prevented recognition and isolated numeric cells were missed by sparse-text segmentation. Temporary rule removal plus block segmentation resolves the reviewed fixture. This is not a general drawing-accuracy benchmark.

Release requires a successful main-branch CI run for the exact commit, publishing that artifact, then checking the actual website and recording deployment evidence. Website-theme publication is separate.
