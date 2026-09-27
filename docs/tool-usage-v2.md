# Tool use measurement v2

PV remains v1 and unchanged. The same-origin /wp-json/mst-visits/v1/tool-event accepts only a v2 record with fixed action/tool/input-mode enums and random in-memory per-attempt ID. No input strings, file names, result contents or client identifiers are transmitted. Existing test/internal/GPC/DNT/logged-in exclusions and private35-day retention remain.

Actions: tool_start = explicit execution (automatic calculators: first trusted edit per document); tool_complete = a usable calculated/extracted result, including a report with findings; tool_export = completed output handed to the browser, once per attempt/document; resource_download = trusted click on a local PDF/CSV/ZIP learning resource, not a confirmed download. Built-in sample, provided input, and unchanged defaults are separate modes. Downloaded samples re-uploaded as files are provided input, never identified as customer work. These are activity counts, not identified people or a session conversion funnel.

Provision tool-collection.json with scripts/provision-site-visits.py (US) or server-scripts/provision-site-visits.py (SG), --tool-events --site <site> --revision <exact release>. Marker is independent of the PV activation and idempotent. Report combines v1/v2 without counting actions as PV; missing prior periods remain unavailable. SSH aggregate only, no public report endpoint.

Mutable input changes do not transmit strings. Export success means the browser was asked to download an already generated result, not that the OS saved it. No retries; blocked collection never prevents tool use.
