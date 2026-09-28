# Connection table exercise

Synthetic teaching records, MIT licensed. No customer data or manufacturing approval.

Load connections-errors.csv, reviewed-tags.csv and bom-errors.csv in https://mst-us.ai/tools/connection-table-check/ . Expect 12 review items with dataset, CSV record and code listed in expected-findings.json. Header is record 1. Download the review.

After investigating the fictional drawing record, load connections-corrected.csv and bom-corrected.csv with the same tag registry. Expect 5 connection records, 5 tags, 0 list discrepancies and BOM assignments checked. The corrected table includes the declared XV-104 branch. This demonstrates list consistency only, not actual pipe connectivity.

A repeated directed pair can be a legitimate parallel line; a tag outside this table may be intentionally out of scope. Do not automatically delete either.

Full explanation: https://mst-us.ai/tools/handbook/#connections
