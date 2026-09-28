# GayOut venue import and production rollout

## Goal

Import every valid venue listed by GayOut without copying reviews, ratings,
photos, or editorial prose; preserve source provenance; route every candidate
through the existing validation and deduplication pipeline; and verify the
result on production.

## Source boundary

- Inventory: `https://www.gayout.com/sitemap-venues.xml`.
- Include all valid venue sections, including gay-friendly hotels and
  restaurants.
- Exclude category landing pages and malformed non-venue URLs.
- Import factual fields only: venue name, controlled category, address, city,
  ISO country, coordinates, contact facts when structured data exposes them,
  and source URL/last-modified provenance.
- Do not copy GayOut reviews, ratings, images, or editorial descriptions.

## Acquisition strategy

1. Treat the venue sitemap as the authoritative inventory.
2. Prefer city/category listing pages when they expose structured or embedded
   venue facts. This reduces origin load from roughly 18,435 detail requests to
   roughly 978 city pages plus focused fallbacks.
3. Fetch individual detail pages only for records still missing identity,
   address, or coordinates.
4. Keep the crawl serial or conservatively bounded, disk-cached, resumable, and
   idempotent. Stop and back off on rate limits or Cloudflare challenges.
5. Persist an audit describing discovered, parsed, failed, and sparse records.

## Production pipeline

1. Refresh existing `source_name='gayout'` staging rows only when normalized
   payloads change.
2. Run validation in bounded batches and reconcile approved/needs-review/error
   counts before continuing.
3. Run deduplication and inspect exact, geographic, and ambiguous matches.
4. Run enrichment for approved unique candidates.
5. Commit only pipeline-approved rows. Existing venues are updated or linked
   through source identity; new venues are inserted through the standard commit
   RPC.
6. Resolve all source-specific rejected/error rows or retain an explicit,
   auditable rejection reason.

## Verification gates

- Inventory count equals parsed plus explicitly rejected source entries.
- Source IDs are unique; names are nonblank; categories satisfy the production
  vocabulary.
- Coordinate and ISO-country values pass range/format checks.
- Staging dispositions reconcile to the original inventory.
- Production `venue_sources` links reconcile to committed/merged outcomes.
- Build, type check, lint, focused tests, security scan, and diff review pass.
- Production E2E verifies venue search, city linkage, detail rendering, map
  coordinates, and representative GayOut-source records across categories and
  regions.

## Rollback

Staging rows are source-scoped by `source_name='gayout'`. Before live commit,
rollback is limited to pausing or rejecting those rows. After commit, use
`venue_sources(source_slug='gayout')` to identify the exact imported/linked
cohort; never delete shared venues solely because a GayOut source link exists.

