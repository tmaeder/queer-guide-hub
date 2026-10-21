# Review backlog completion — active work

## Completion requirement

The user's target is **fewer than 100 pending items across all queues in total**. The preceding venue-matching delivery does not satisfy that goal. Do not substitute ready-case counts, a filtered view or a single queue for the complete total. Machine findings must be included when auditing the current displayed all-queue count.

Latest inspected full cached count: **159,638 rows (7,709 decisions, 151,929 findings)**, refreshed 2026-10-21 20:17:28 UTC. The prior inspected total was 320,741 at 18:20 UTC; source activity continues concurrently, so per-repair counts are not a net-change claim. The goal remains active.

## Verified additional repairs

- 1,050 organizations received an existing, unmodified description from their sole, explicitly linked primary venue. Names and known city/country must agree, the venue must be canonical/open, and supplied organization prose is never overwritten. All 1,050 texts match the source, all corresponding editorial findings pass, and every mutation has a `business_brand_quality_events` audit plus field provenance.
- 3 organizations received missing city/country fields from their sole canonical primary venue, after confirming the city-country relation and preserving all known values. Their three location findings now pass.
- 101 organizations received existing social-contact URLs from the same identity-checked source. Only supported platform URLs pass; existing social fields are preserved. The 101 corresponding contact findings now pass.
- Source enrichment requests 55602–55607 and 55652–55657 processed 120 city visits and reported 71 updates. Request 55680 then corrected the two measured Italian municipality refusals (Bastia Umbra and Bisceglie) and filled their source-backed facts.
- The city resolver's English class vocabulary omitted Wikidata Q747074 (`comune of Italy`, a subclass of municipality). That precise label and search wording are now recognized. Province/district/locality exclusions and coordinate guards remain. Runtime revision `2026-10-21.italian-municipality-class`, version 265, was verified in request 55680.

## Additional source work and diagnosis

- Requests 55682–55687: 60 city visits, 33 reported updates.
- Requests 55701–55706: next 60 city visits, 32 reported updates.
- Requests 55723–55734 returned zero updates and no candidate results, with no transport errors represented in the response. The broad dispatcher was stopped for diagnosis; requests 55755–55760 had already been dispatched and completed with 34 reported updates. Use the per-request results and actual city provenance to count unique repairs; do not sum repeated visits as unique repaired cities.
- The resolver's search used `fetchJson`, which converts HTTP/network failures to null. That could bump no-candidate attempts on an unreadable source. The prepared `2026-10-21.retryable-city-search` revision uses the entity reader's retry handling and throws on failed/malformed search responses. Five regression tests distinguish unavailable/error responses from a successful empty result. The combined 23 resolver tests and Deno typecheck pass. This revision was deployed after the coordinated release as version 268. Request 56186 returned HTTP 200 and the exact revision with `dry_run=true`; reported fills in that probe were simulated, not saved.
- Staging gate request 55608 rechecked 261 rows and correctly approved none: most lacked a quality verdict. Request 55700 ran the missing quality stage for 24 rows (18 review, 6 rejected). Request 55743 swept pending-review rows, but the quality stage had selected rows still marked `auto`. Request 55804 then covered both states and rejected 516 records that already carried rejection verdicts; 484 were retained for further evidence/review. Requests 55817 and 55818 completed HTTP 200 with 24 rows each: 15 passed, 19 review, 14 rejected. Scoped gates 55846 and 55847 then approved 15 and rejected 14, retaining 52 for further evidence/review.
- Event-image request 55787 inspected 20 events and attempted 25 network requests, finding no usable replacement images. No media was guessed, borrowed from another event or declared verified.

## Operational constraints

- The coordinated production schema freeze ended after email PR #4542 and its deployments completed. No schema was changed by this work during that freeze. Migration `20261021183535_reconcile_remaining_advisor_security` is not from this branch. Our new source-contract migration is committed under its exact applied version `20261021184341`.
- The database connector refused `run_city_quality_issue_sync(1000)` with a permission error. Do not bypass that refusal through another route. Enriched cities remain present in their existing review rows until permitted reconciliation runs.
- Firecrawl has no available credits. Official Wikidata class evidence was verified with the web tool instead: https://www.wikidata.org/wiki/Q747074.

## Next work

1. Finish source-stage processing for staging rows and apply the existing review gate to both `auto` and `pending_review` states.
2. Deploy/verify retryable city search after the coordinated release; use `last_refreshed_at` and exact request results as the sweep cursor, since an old resolved `wikidata_link` status can survive a removed QID.
3. Continue bounded enrichment and deterministic corrections across business, event, city and geography records. Preserve real evidence gaps; never mark a record correct just to meet a counter target.
4. Re-audit all queue families and live totals before declaring the goal complete.

## State at the current checkpoint

- No new schema migration was applied during the freeze. After it ended, `20261021184341_business_facts_only_source_outcomes.sql` was applied and committed as `7579ec016`. Isolated PostgreSQL fixtures and a rolled-back production-schema regression passed; the ordinary live refresh also executed successfully inside that rollback. Security advisor returned no lints.
- The first 600-record sweep driver was stopped after zero-yield waves. It must not be restarted blindly. Each dispatched request listed above has been inspected; source search errors and old resolved probe states require the corrected runtime and a cursor based on `last_refreshed_at` before a broader continuation.
- Current business fixes total **1,154** (1,050 descriptions + 101 social-contact records + 3 geography records), each with matching audit/provenance and a factual finding update. These are per-family repairs, not necessarily unique entities.
- Prepared city-search source changes and DML repair scripts are committed on `feat/matching-decisions-20261021`; commit `80d2c56a0` was pushed to PR #4547. The location repair and this checkpoint follow in the next commit.

## Facts-only source reconciliation completed

The ordinary business quality producer now honors the existing facts-only `gays-cruising` source contract for tightly scoped sole-location identities. Missing editorial/contact/media facts are explicit `source_unavailable` outcomes with source record references, not passes, waivers or manufactured content. Other sources/roles/locations, conflicting identity/geography and supplied raw extra facts exclude scope. Supplied passing content remains unchanged. A changed registered source invalidates the quality-check cursor.

Bounded production passes recorded **161,021 audited finding outcomes across 53,675 organizations**. The final pass examined 1,675 organizations and recorded 5,025 outcomes. An additional real pass examined zero and changed zero, proving convergence at that point. This is an assessed source limitation, not 161,021 enriched facts. Current quality scores retain the underlying missing content; verification timestamps, publication and safety flags were not changed.

All-source cache refresh succeeded (41 sources, 2,616 ms). Nonzero queues at 20:17:28 UTC: business quality 96,795; event quality 35,797; general review 24,589; geography 1,869; staging 550; org links 19; tag enrichment 16; dedup review 3. Total **159,638**, so the target remains unachieved. The existing queue view already excludes `never_verified` and `logo_lookup_pending`; do not claim those hidden machine gaps are part of its displayed total or fabricate timestamps to reduce them.
