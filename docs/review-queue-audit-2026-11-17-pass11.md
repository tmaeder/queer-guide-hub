# Review recovery — 17 November 2026, pass 11

Applied **17 audited production repairs**: two incorrect venue merge inverses, four native business merges and eleven public-profile corrections. Also deployed two expression indexes for a recurring local-research bottleneck. At **19:37 UTC**, the refreshed queue contained **2,775 active cases**, versus 2,838 at the user's checkpoint/first read. Ingestion and scheduled processing contribute to the movement; it is not a manual-closure count.

This pass triaged 20 duplicate-business candidates and attempted 24 publisher/official-source captures. It does not claim individual research of the whole queue. The [source manifest](review-queue-source-research-2026-11-17-pass11.json) records decisions, URLs, hashes, native revision IDs and validation. Full repair snapshots remain in `admin_review_repairs`, with native merge/source and content-revision history.

## Incorrect venue merges restored

Royal Hotel Paddington, at **237 Glenmore Road**, had been merged into Royal Leichhardt, at **156 Norton Street**. King's Arms Kennington, at **98 Kennington Lane**, had been merged into King's Arms Soho, at **23 Poland Street**. The current operator/publisher pages distinguish both pairs. Restored Paddington and Kennington as separate canonical venues.

Applied scoped inverses of the complete schema-1 merge histories: restored two recorded venue-source associations, routed the recorded Kennington duplicate child back to Kennington, removed the two redirects created by those merges, and marked the original merge audits undone with evidence. All other recorded child arrays were empty. Row locks, exact snapshots, graph checks and rejection of later human identity edits protected the operation. No force or user impersonation was used. The Soho/Leichhardt venue content was preserved during the inverse; Leichhardt's website was separately corrected afterward.

Restoration also activated existing venue-to-business inheritance. Native revision history records the resulting addresses, existing venue coordinates and postal codes, followed by scheduled contact inheritance. These are distinguished from manually verified contacts. The copied Kennington postcode disagreed with both its full address and current publisher: corrected **SE11 4XA → SE11 4XD** in the venue and business. No new coordinates were inferred.

## Businesses and public profiles

Merged the unclaimed, venue-only duplicates for **Voyeur, Woodshed, Rupert Street and Tip Top** after source and relationship checks. Their donor venues were already merged into the matching canonical venues. Only Tip Top transferred a gap field: its officially published shared phone. A neutral canonical description prevented transfer of unsupported donor wording.

The eleven profile audits cover Woodshed's current **3935 Queen City Drive** address and official website in both records, with its unsupported former pins withdrawn; Rupert Street's missing street and corrected official phone/website plus a factual business description; Tip Top's official website and missing description; Rifugio's missing venue website; Leichhardt's replacement official website in both records; and the two Kennington postcodes.

Every data transaction passed rollback before commit. The profile rollback caught the venue trigger's derived `address_normalized` change; the final guard explicitly checks it against the native normalizer. Independent readback confirms **11/11 profile patches**, four source-attributed merge audits, both restored source links, the corrected child graph, no stale redirects, and both withdrawn Woodshed pins. The four donors have zero open non-waived findings. One observed reconciler call retired three findings in 4.0 seconds including network overhead; scheduled processing may have handled others.

## Local-research timeout

A 30-second worklist check timed out in `research_admin_review_local`'s geographic-name guard. Its unchanged expression recomputed `normalize_name(name)` across the city catalogue for each unmatched venue name. The observed unmatched query scanned 19,630 city rows and 181 villages, taking **830.140 ms**.

Migration `20261117193506_index_review_geographic_name_checks.sql` adds two matching expression indexes. The city index preserves the existing `duplicate_of_id IS NULL` restriction; the village index preserves the original inclusion of every village row. No function, predicate, normalization, lease, publication, source authorization, ACL or persistent timeout was changed. Production indexes are ready/valid (about 568 KiB and 16 KiB). The research-function hash is unchanged. The same observed unmatched query now uses both indexes and executes in **0.087 ms**. These are individual observations, not a controlled benchmark.

Native PostgreSQL 17 verification used the actual migration with 20,003 cities and 181 villages. It checks lookup/row preservation, accents/null/punctuation, canonical and merged-city behavior, existing merged-village behavior, both index plans, and 1,000 generic-plan misses within a five-second statement budget. Current and PostgreSQL 17 parsers accept the migration. Security-advisor findings are unchanged after removing observation timestamps.

The reproducible fixture is `supabase/tests/isolated/run_review_geographic_indexes.py`, registered alongside the existing isolated fixtures in merge-policy CI (PostgreSQL 16). Its observed local result is PostgreSQL 17 success; CI registration is not represented as an observed CI pass.

The first post-index worklist check still hit its local 30-second budget in source aggregation. A one-off 45-second check completed in **24,191 ms server time**, with 2,775 cases and no active refresh afterward. Queue-top refresh completed in 18,104 ms. Overall refresh duration remains load-sensitive; this pass does not claim every timeout is eliminated or raise persistent limits.

## Remaining holds

Missing source (930), source URL (591), actionable proposal (532), conflicting identity (234), source authorization (153), unavailable source (110) and insufficient confidence (56) dominate the remaining queue. Rifugio's phone, Twist's phone and Steamer's proposed inbox lack current official corroboration. Several official domains failed DNS; failure is not proof of closure. Zodiac's old domains redirect to Google, while closure reporting conflicts with an apparent karaoke operator page: operating status and merge remain held. Rupert Street's coordinates were not independently re-established. Unsupported contacts, coordinates and ownership assertions were not batch-approved.
