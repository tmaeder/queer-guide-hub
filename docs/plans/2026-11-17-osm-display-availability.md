# Restore OSM and Display production imports

The authorized goal is actual production ingestion for both providers. Preserve
the existing authentication, canonical staging, idempotency and review contract.

Display now advertises a public static feed at
`/wp-content/uploads/dspev-feed/events.json`, which returns 268 event records
without the obsolete Tribe API or challenged PHP routes. Read that exact feed
with byte/time limits and validate its shape/freshness. Expand explicitly
published sessions into stable dated occurrences with their own city, venue and
ticket link. Do not apply aggregate date ranges or parent venues to individual
showtimes, and do not invent venue post IDs. Resume its automation only after
real fetch/normalization/staging verification.

OSM's existing endpoint and two documented alternatives need production-network
controls. Probe the already-authenticated internal extraction service using its
dedicated configured secret; general-secret rejection is not proof that its
configured client fails. Use only a verified public global provider and a bounded
transport with existing credentials. Preserve UNKNOWN versus actual empty
answers and the existing total run deadline. Do not buy a provider subscription
or replace missing data with a successful empty response.

Add meaningful occurrence/transport regressions, run related checks, merge and
deploy the production repair, and run bounded real imports to confirm canonical
staging and repeat-import idempotency. Leave unrelated ongoing Review migrations
with their owning chat as previously directed.

OSM recovery uses QLever's global index only to discover a bounded set of node
IDs. Its currently advertised snapshot is 2026-09-21; this is NOT current venue
data. After one failed Overpass call, discover candidates once per run, restrict
them to the existing city boxes, then fetch at most 100 known nodes per city
from the authoritative OSM multi-node JSON API. Recheck current coordinates and
explicit relevance tags before staging. Preserve source IDs, version, timestamp,
live-fetch time and discovery snapshot provenance. Empty snapshot coverage stays
UNKNOWN. The response labels this limited coverage; newly created nodes can wait
for the discovery index to update. Reject malformed/truncated or >180-day-old
indexes, cap response bytes and keep the 90-second total budget. No new key,
paid account or proxy is needed. Optional OVERPASS_API_URL remains available.

Verified Display production import: 300 occurrences staged, repeat skipped 300
with zero errors; daily ev_fill_display_magazin automation resumed. Migration
CI remains owned by the separate Review chat (three production-only records at
22:58 UTC); no history repairs or required-check bypass belong to this change.

Full OSM production verification: 272 live-refreshed venues in 14 cities, 251
new staging rows and 21 already-seen IDs. Repeat skipped all 272. Standard
validation rejected none: 167 approved, 84 need review. Cape Town has no
snapshot candidates and remains UNKNOWN rather than an asserted empty city.

Display's feed publishes some same-date end clocks earlier than their start.
Preserve these raw values as source_date_issue provenance and leave the end
unknown; do not infer a next-day closing date. Repair only this import's affected
staging rows and let normal validation decide the rest.

The current feed also includes a locationless calendar observance (Transgender
Day of Remembrance), rejected normally as E_NO_LOCATION. Exclude records with
no published city, address or country before staging so recurring imports do
not keep retrying an unpublishable observance. Do not fabricate a venue. Both
tracked production automation runs now report success with zero consecutive
failures, and both pg_cron jobs are active.
