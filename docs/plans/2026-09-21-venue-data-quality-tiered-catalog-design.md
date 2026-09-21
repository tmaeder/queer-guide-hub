# Venue data quality and tiered catalog

## Decision

Preserve broad venue coverage while separating catalog presence from editorial readiness. A venue may remain discoverable as `listed`, but only `guide_ready` and `verified` venues receive prominent ranking and search-engine indexing. Safety gating remains an independent access-control concern.

## Baseline

The production audit on 2026-09-21 found 38,029 venue rows, 26,321 active canonical venues, and 20,677 anonymously browsable venues. Among the browsable set, 47.1% had any description, 6.6% had at least 160 characters, 4.6% had a venue image, 24.2% used the `other` category, and 26.7% already needed attention. Stored quality scores were stale for 21,005 live venues. The controlled venue-tag junction was empty, managed images lacked rights metadata, and only 44.5% of upcoming public events were linked to a venue.

## Quality model

Each venue receives a versioned snapshot with typed scores for identity, location, taxonomy, description, media, contact, freshness, and relationships; explicit blocker codes; a calculated timestamp; and one tier:

- `listed`: active canonical venue with valid identity, country, usable location, at least one source, and no hard blocker.
- `guide_ready`: listed, categorized, evidence-backed description of at least 120 characters, active managed cover image, usable contact channel, source evidence within 180 days, and no unresolved attention flag.
- `verified`: guide-ready plus timestamped human or owner verification with evidence.
- `suppressed`: duplicate, archived, closed, confirmed non-venue, structurally invalid, or otherwise ineligible for the current catalog.

The model initially runs in shadow mode. Existing visibility remains unchanged until an explicit rollout setting enables tier enforcement. Public APIs expose only tier, public score, and verification freshness; dimension scores, blockers, evidence, and provenance remain admin-only.

## Data authority and discovery

- `venue_tag_assignments` becomes the tag write authority; `venues.tags` remains a compatibility projection during migration.
- `image_asset_links` becomes the media authority; `venues.images` remains a compatibility projection during migration.
- Source observation timestamps, processing timestamps, and verification timestamps are distinct.
- Ranking orders verified, guide-ready, then listed venues. Hard blockers cannot be offset by completeness points.
- Listed venues remain available in explicit browse and exact search but are excluded from teaser rails and recommendations once enforcement is enabled.
- Only guide-ready and verified venues are indexable after enforcement is enabled.

## Delivery

The first release supplies the shadow quality model, reconciliation queue, catalog contract, admin metrics, compatibility paths, and test coverage. Backfills run in bounded batches and expose remaining work. Subsequent enrichment uses source-specific cohorts and prioritizes high-traffic venues, upcoming-event venues, measured city gaps, and unresolved locations without generating unsupported facts.

