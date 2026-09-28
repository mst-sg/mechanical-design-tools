# Practical P&ID and BOM exercises

Issue #24 connects a concrete engineering question to instructions, synthetic inputs, a browser-local checker and a downloadable review. Existing tutorial URLs and the handbook remain the explanation entry points.

Input contract: from/to connection CSV, a unique reviewed tag registry and optional tag-to-part BOM assignments. Identifiers retain case and leading zeros. Results identify input dataset and CSV record (header is record 1), connection and endpoints. Repeated endpoint pairs and tags absent from the connection table require human interpretation; parallel lines or a deliberately excluded instrument can be legitimate. This tool cannot infer physical ports or validate an actual pipe network.

The product and QA contract is frozen before implementation: empty/loading/error/result/reset states, source-record navigation, CSV export, edited-input invalidation, semantic controls, stacked mobile inputs and a contained results table. Use the existing restrained visual system. Long instructions stay in the handbook.

Known community needs include [BOM revision comparison](https://forums.autodesk.com/t5/fusion-manage-forum/revisions-and-boms/td-p/12626598), [BOM configuration/export differences](https://www.reddit.com/r/SolidWorks/comments/1812g4h/), and [sharing STEP plus BOM](https://www.reddit.com/r/MechanicalEngineering/comments/1nrhdfp/always_struggle_sharing_step_bom_with/). They are qualitative problem evidence, not measured demand or customer endorsements. Connection-list checking is a bounded application of the approved P&ID handoff workflow.

Verification requires independently enumerated faulty/corrected fixtures, exact-identity and optional-BOM cases, malformed inputs, upload/download, keyboard/source navigation, desktop/mobile Chromium and mobile WebKit, screenshots and unexpected-egress checks. Refresh clears inputs. Formal usage must exclude QA, and events contain no document data.
