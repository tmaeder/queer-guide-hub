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
