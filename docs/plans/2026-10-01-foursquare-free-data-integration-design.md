# Foursquare free-data integration design

Date: 2026-10-01
Status: Approved

## Objective

Use every relevant free Foursquare resource to improve Queer Guide venue coverage,
freshness, provenance, and field completeness without treating generic place data as
evidence of LGBTQ+ relevance or allowing provider limits to create paid usage.

## Current state

Queer Guide already has a `source-foursquare` adapter, venue-specific source
provenance, staging, deduplication, relevance validation, a venue truth engine, and
fields for Foursquare identifiers and ratings. The adapter still calls the legacy
`api.foursquare.com/v3` endpoint, which Foursquare deprecated on 2026-05-15. A second
photo-enrichment function already uses the replacement host but has no shared usage
budget or durable prioritization.

The September 2026 repository audit found that FSQ OS Places was no longer available
as an anonymous S3 download. Current Foursquare documentation now describes free
access through the Places Portal and an Iceberg catalog. Account/token provisioning
is therefore an operational prerequisite, not a reason to classify the dataset as
paid or unavailable.

## Chosen approach

Adopt a hybrid architecture:

1. FSQ OS Places is the bulk, Apache-2.0 baseline for matching, discovery, contact
   enrichment, freshness, categories, merge redirects, and quality flags.
2. The modern Places API is a scarce rich-data source. A hard persisted allowance
   limits it to the currently free call tier and prioritizes records where the
   expected quality gain is highest.
3. Every candidate and proposed change flows through Queer Guide's existing staging,
   provenance, deduplication, relevance, consensus, and review machinery.

An API-only design was rejected because the free allowance cannot cover the venue
catalog. An OS-only design was rejected because the open dataset does not include all
rich API fields such as ratings, photos, hours, and popularity.

## Free resource inventory

| Resource | Use |
| --- | --- |
| OS Places snapshot | Bulk matching and discovery; names, coordinates, addresses, contacts, social handles, categories, refresh/closure dates, unresolved flags |
| OS category dataset | Versioned FSQ-category-to-Queer-Guide taxonomy mapping |
| OS delta dataset | Incremental `add`, `update`, `merge`, and `remove` processing |
| OS PMTiles | Coverage and gap analysis only; never a canonical write path |
| Placemaker URLs | Moderator-only links for inspecting or correcting questionable places |
| Places Search and Details API | Prioritized rich enrichment within a zero-spend allowance |
| Place Match offline jobs | Optional accelerator only after the portal confirms they are included in free access |

Primary documentation:

- <https://docs.foursquare.com/data-products/docs/access-fsq-os-places>
- <https://docs.foursquare.com/data-products/docs/places-os-data-schema>
- <https://docs.foursquare.com/fsq-developers-places/reference/place-search>
- <https://docs.foursquare.com/fsq-developers-places/reference/place-details>
- <https://docs.foursquare.com/developer/reference/upcoming-changes>

## Data flow

### Initial OS sync

An operator-side TypeScript/DuckDB command connects to the Foursquare Iceberg catalog
using a secret supplied at runtime. It reads only the geographic partitions needed by
the venue catalog and configured discovery markets. It emits bounded NDJSON batches
to a service-role-only Edge Function or stages them through the existing ingestion
contract.

Existing venues are matched in descending confidence order:

1. Existing `foursquare_id`, `platform_ids.foursquare`, or `venue_sources` identity.
2. Exact normalized phone, website domain, or email plus compatible geography.
3. Normalized name and address/coordinate agreement within conservative distance
   thresholds.
4. Ambiguous matches become review proposals and never auto-merge.

Unmatched OS places may become discovery candidates only when an explicit queer term
or trusted queer source supplies relevance evidence. Foursquare category, popularity,
or proximity alone is never sufficient.

### Delta sync

Delta actions are processed in Foursquare's recommended order: add, update, merge,
remove. Updates refresh the source observation and recompute field proposals. Merges
preserve the old FSQ ID as a redirect to the survivor. Removes and closure-related
flags are negative evidence for the truth engine, not direct deletion commands.

### API enrichment

The API adapter uses:

- `https://places-api.foursquare.com`
- `Authorization: Bearer <service key>`
- `X-Places-Api-Version: 2025-06-17`
- `fsq_place_id` and the current flat latitude/longitude response shape

A persisted monthly usage ledger reserves a configurable safety margin beneath the
free allowance. Calls are atomic and fail closed when no allowance remains. Priority
is: ambiguous high-value matches, featured/stale venues, missing image or hours,
missing contact data, then discovery candidates. Dry runs consume no API calls.

## Field policy

Every imported value retains its source payload, observed date, confidence, and source
identity. The following rules apply:

- Stable FSQ IDs and merge redirects may auto-apply after identity validation.
- Missing address, coordinates, phone, website, email, socials, postal code, and
  categories may auto-fill on an exact/high-confidence match.
- Conflicting non-empty values become field proposals unless the existing value is
  demonstrably stale and source precedence permits replacement.
- `date_refreshed` informs freshness but does not prove every field is current.
- `date_closed`, `remove`, and unresolved `closed`, `duplicate`, `delete`,
  `privatevenue`, `inappropriate`, or `doesnt_exist` flags create review/consensus
  signals; none may independently close, merge, hide, or delete a Queer Guide venue.
- Rich API ratings, hours, attributes, popularity, and image metadata retain
  Foursquare provenance and must not masquerade as community verification.

## Schema and components

Implementation should add or update:

- A current `source-foursquare` adapter shared by search and detail enrichment.
- Pure parsing, category mapping, matching, and prioritization modules with tests.
- An FSQ OS import Edge Function accepting bounded records and staging them safely.
- A local OS sync CLI with snapshot/delta modes, checkpointing, and dry-run reports.
- Source metadata for `foursquare_os`, including Apache-2.0 attribution.
- A durable API allowance ledger/RPC with atomic reservation and per-purpose usage.
- Foursquare identity/redirect storage and field-level source observations.
- Admin/read-only health summaries for coverage, match confidence, field uplift,
  unresolved flags, delta lag, and free-call consumption.

## Operational safeguards

- Secrets remain server-side and are never logged.
- Bulk jobs are resumable, idempotent, bounded, and default to dry-run.
- A zero-spend setting is the default; no overage is permitted.
- Snapshot and delta licenses/NOTICE files are retained with derived artifacts.
- Imports stop on schema drift rather than silently dropping fields.
- Existing high-risk geographic visibility gates remain unchanged.
- All automatic mutations are reversible through source payloads and audit records.

## Rollout and verification

1. Unit-test current API parsing, OS record parsing, category mapping, match confidence,
   delta ordering, merge redirects, and budget exhaustion.
2. Run a no-network fixture-based integration test through staging and commit.
3. Produce a global dry-run baseline: match rate, confidence distribution, discovery
   count, per-field uplift, conflict rate, closure/duplicate flags, and expected API
   demand.
4. Canary one well-covered country without auto-applying ambiguous changes.
5. Compare before/after quality metrics and manually sample every auto-apply class.
6. Enable additional countries only when precision and review-volume thresholds pass.

Completion requires the modern adapter, OS snapshot and delta paths, category mapping,
quality-signal integration, hard free-call budget, provenance, monitoring, tests, and a
successful dry-run/canary report. Portal credentials are an operational dependency;
the code must degrade to an explicit skipped state when they are absent.
