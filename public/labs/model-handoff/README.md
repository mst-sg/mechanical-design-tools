# Synthetic BOM–model handoff exercise

Use https://mst-us.ai/tools/bom-model-check/ and the instructions at https://mst-us.ai/tools/handbook/#models.

The error files reproduce the built-in handoff sample. Expected result: BRK-100 is a metadata match; PIN-020 has a revision conflict; VAL-200 has no model mapping; SCR-M6 has two mappings; WSH-M6 lacks a required revision; LEGACY-10 is not in the BOM.

For this invented exercise only, the release owner's declared decisions are:
- PIN-020 requires revision A, referenced as pin-A.step.
- VAL-200 requires revision A, referenced as valve-A.step.
- SCR-M6 uses screw-a.step, revision A; the alternate is outside this package.
- WSH-M6 requires revision A, referenced as washer.step.
- LEGACY-10 is outside this BOM and this package.
- BRK-100 remains revision B, referenced as bracket-B.step.

These decisions are provided by the exercise, not inferred from filenames or recommended for a real design. Load both corrected files and expect five Metadata match records with File presence not checked. There are no CAD files in this pack. The tool does not inspect native revisions, geometry or engineering suitability. In a real workflow, obtain equivalent mapping decisions from the controlled part master and responsible owner.

CSV record numbers include the header as record 1. Save your exported review and the actual selected source revisions in your own handoff package. All inputs are synthetic and MIT licensed; SHA256SUMS covers each bundled file.
