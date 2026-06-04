---
name: ActiveCampaign /contacts pagination
description: AC contact pagination must be driven by meta.total, not "length < limit"
---

# ActiveCampaign /contacts pagination bug

When paginating `/api/3/contacts` (with `listid`, `tagid`, or any filter), DO NOT stop
the loop on `if (contacts.length < limit) break`. ActiveCampaign returns pages with
fewer than `limit` rows mid-stream (e.g. a page at offset=1000 returned 99 of 100)
even when many more contacts exist. That heuristic truncates results silently.

**Why:** A list with `meta.total = 3782` was being read as only ~1099 emails because a
short page tripped the early break. This made the funnel "Conversões" metric
(list-30 ∩ tag-401) compute 17 instead of the true 38 — appearing to "drop out of nowhere".

**How to apply:** Drive the loop with `meta.total`: after each fetch, stop only when
`contacts.length === 0` OR `offset (after increment) >= parseInt(data.meta.total)`.
All four paginating AC helpers in `sources/activecampaign.ts` use this pattern.
