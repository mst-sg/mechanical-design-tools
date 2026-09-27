# Drawing → checked BOM → revision review

Synthetic exercise by MST; MIT licensed. No customer data. Not for manufacture.

1. Open bracket-bom.pdf or bracket-bom.png in https://mst-us.ai/tools/drawing-to-bom/#drawing-bom-lab.
2. Crop the printed table, extract and review all five rows.
3. Practice correcting transcription-errors.csv in BOM Check: PIN-O20 → PIN-020; SCR-M6 6 → 4; bracket material → Aluminium 6061; remove the extra washer row (do not combine it).
4. Compare the reviewed A with revision-b.csv in BOM Compare. Expect 1 added, 1 removed, 2 changed, 2 unchanged.
5. Export and check part values against expected-differences.csv. Read handbook.html for details and failure recovery.

All five parts continue from the drawing to revision A. This is separate from the older four-row BOM Compare quick sample. SHA256SUMS lets you verify the downloaded pack with `shasum -a 256 -c SHA256SUMS` (macOS) or `sha256sum -c SHA256SUMS` (Linux).
