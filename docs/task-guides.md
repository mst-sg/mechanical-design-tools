# Issue 9 — complete a useful first task

## Scope and design

Help a mechanical engineer check a P&ID tag list or compare two flat BOM revisions before using their own files. Keep the existing processing, review gates, privacy model and canonical URLs. This is a guidance update, not a new recognition or assembly capability.

Keep the site's warm neutral background, green text, copper actions and existing native controls. Put P&ID Tag Check and BOM Compare first in the tool directory; associate each existing line illustration with its tool rather than its array position. Keep the menu compact.

Component structure: existing App → directory or tool → compact sample guidance → existing working controls and computed results → illustrated worked example → interpretation and related reading. The P&ID example shows the actual synthetic source drawing alongside expected review findings. The BOM example uses a readable revision table and downloadable inputs matching the interactive sample. Neither example represents a result from the visitor's files.

States remain empty, loading/recognizing, source review, computed results, invalid input and recovery. Guidance and sample downloads are available in prerendered HTML without JavaScript. No new state management or OCR callback is needed. Two-column examples collapse below 800 px; comparison tables scroll within their region. Preserve native keyboard links/buttons, visible focus, image alt text and table headers.

Risks to check before release:

1. A static example could be mistaken for the user's computed output: label it as a synthetic worked example and expected findings.
2. Reordering tools could attach the wrong illustration: select drawings by slug.
3. Downloaded BOM inputs could drift from the built-in sample: compare their contents in the existing browser workflow.
4. A matched tag or repeated occurrence could suggest engineering approval or equipment quantity: explain what counts mean and what needs source review.
5. Extra guidance could crowd the first screen or overflow phones: keep the starting hint compact, place the full example below controls, and inspect both viewport sizes.

## Verification contract

- Persona: first-time equipment/mechanical engineer, no account and no private drawing required.
- Fixtures: existing synthetic pump-loop image/reference CSV and two synthetic bracket BOM revisions. No customer material.
- P&ID oracle: after source review, P-101, PT-101 and FT-102 occur on both lists; XV-104 appears only in the drawing; TT-103 only in the reference. PT-101 has two drawing occurrences and one reference occurrence. The source-review checkbox remains required.
- BOM oracle: one added NUT-M6, one removed WSH-M6, changed PIN-020 material and SCR-M6 quantity (4 → 6), and unchanged BRK-100. Download both examples, reopen them, compare and inspect the exported CSV.
- Negative paths: existing duplicate-part/unclosed-CSV rejection, invalid tags, OCR cancellation and hydration gates continue to pass. Existing changed-input OCR fixtures guard against canned results.
- Budgets: local directory usable within 5 seconds; public within 10 seconds. Existing OCR tests allow 100 seconds for model initialization/recognition; this is a test ceiling, not a product speed claim.
- Browsers: desktop Chromium, mobile Chromium and mobile WebKit; JavaScript-disabled discovery and guide/download visibility. Manually inspect desktop and narrow-screen layouts and keyboard navigation.
- Evidence: typecheck, unit tests, build, repository E2E screenshots/traces; browser console, HTTP failures and unexpected writes/egress checked by the existing suite. Release only a successful main-branch CI artifact; verify public pages after promotion.

Review is by the implementing agent. No independent review or customer effectiveness measurement is claimed.

## Sample-path correction found during verification

The original built-in P&ID crop (2%, 10%, 96%, 80%) produced three of the five printed occurrences in Chrome. Reading the same full image produced all five. Change only that fixture's initial crop to the full page; preserve the recognition algorithm and source-review gate. A new browser regression follows the actual Try a sample → Read text → review → sample reference → compare → export path, asserting all five occurrences and every exported row. The existing altered-image test still checks different identifiers. This fixes the sample path, not arbitrary drawing recognition.

## Local verification outcome

2026-09-21: Node 24.4.0 typecheck, all 16 unit tests, production build and 26 browser tests passed; 10 desktop-only cases explicitly skipped in mobile projects. The new sample regression failed on the old crop and passed on the corrected crop in all three browser projects. Final mobile table layout and existing negative paths passed. Main CI and public release verification are tracked on the pull request/release record.
