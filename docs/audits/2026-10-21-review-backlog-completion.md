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

## Registered source fact recovery

`recover-registered-organization-facts.sql` recovers unique, valid facts from already registered `venue_sources.normalized` payloads for exact-name, sole-primary-venue identities with compatible geography and high source confidence. Unknown and AI-only imports are excluded; supplied profile fields are preserved. It defaults to dry run and locks a maximum of 200 organizations.

The initial rolled-back production test attempted 192 fields; the real pass did the same and corrected 34 actual findings. Post-commit verification exposed that the existing canonical phone trigger rejected 135 malformed numbers and normalized 16 valid ones. Consequently **57 fields actually persisted**, not 192. The final script now uses `canonicalize_phone` before selecting a phone and compares canonical values for ambiguity. This recovered one additional valid phone, bringing the independently verified total to **58 stored facts: 18 descriptions, 14 websites, 9 emails and 17 canonical phones**. Email casing is normalized by the existing trigger. The final dry run selected zero candidates.

The 135 rejected attempts remain in the original audit. `reconcile-rejected-registered-phones.sql` added compensating audit events linked through `rollback_of` and annotated the phone provenance as `rejected_by_canonical_phone_guard`; it did not store invalid phones or claim they passed. That script also defaults to dry run. Existing safety/publication/verification fields are untouched.

City probe 56186 verified the deployed retryable-search revision. A follow-up request targets the three inspected identity cases Trigueros, Trincity and Trinidad. Inspect its terminal response before claiming source changes or dispatching retries. The normal `city_quality_issue_sync` cron remains enabled at 04:20; its earlier interactive refusal has not been bypassed.

## Checkpoint 20:31 UTC

- The latest all-source count refresh succeeded in 2,526 ms over 41 sources: **159,990 total = 151,893 findings + 8,097 decisions**. Nonzero queues: business quality 96,761; event quality 35,792; general review 24,589; geography 1,869; staging 941; org links 19; tag enrichment 16; dedup review 3. Concurrent source activity increased staging since the previous snapshot. The under-100 goal is still active.
- Source recovery's final dry run selects zero candidates. The verified 58 stored fields agree with source values after canonical phone/email normalization. The 135 rejected phone attempts have compensating events and corrected provenance.
- News quality requests 57357/57358 both completed HTTP 200: 48 assessed, 27 passed, 14 review, 7 rejected. Gate 57359 completed HTTP 200 and rejected 335 prior rejection verdicts, retaining 665. Scoped successor gates 57385/57386 completed HTTP 200: 27 approved, 7 rejected, 43 retained. No relevance/manual/sensitive threshold was relaxed. These are stage outcomes, not unique net queue reductions.
- City request **57332** completed HTTP 200 using the older revision restored by the subsequent main deployment (GitHub run 39659103454). It updated Trigueros, refused Trinidad's candidate 10,770.7 km away and found no candidate for Trincity. After confirming that deployment was terminal, the tested local revision was redeployed as **version 270**. Request **57374** completed HTTP 200 and proved runtime revision `2026-10-21.retryable-city-search`; it found no eligible candidate for Trincity and changed zero. Wikidata's actual search result describes Trincity as a planned community; do not loosen settlement/locality guards merely to adopt it.
- `run_venue_category_reclassify(300,1,true)` examined zero due candidates. The remaining broad category gaps cannot be claimed fixed by that worker. Source normalized categories provide only a small further deterministic subset; names alone are not enough.
- Original migration comments were preserved when merging main's automated recovery of the already-applied source-contract migration; the only conflict was a recovery header and trailing semicolon. Current pushed code commit is `a4316f8d0`. PR #4547 has no failed checks at this checkpoint; critical-path run 39670282678 and test job 119466538969 in run 39670282736 were still running. Inspect those handles, not an invented replacement run. The local PostgreSQL regression passed again after the main merge.

## Checkpoint 20:59 UTC: source-specific limits and case integration

- Applied and committed `20261021203842_source_specific_business_quality_limits.sql` after isolated fixtures passed. The helper now names unavailable dimensions: GayOut and Planet Randy only editorial/media; their contact research remains open. Exact structured source metadata, source-name and hostname guards exclude legacy source labels and mismatched identities. Supplied values remain passes, raw supplied prose/media invalidate the contract, and changed evidence schedules reassessment.
- A rolled-back production test assessed 50 identities/100 outcomes, asserted unchanged contact outcomes and complete audits, and successfully executed the ordinary quality refresh. Security advisor returned no lints.
- Bounded real reconciliation assessed **24,201 outcomes across 12,167 organizations**: GayOut 22,614 across 11,307; Planet Randy 1,587 across 860. A repeat real pass examined zero and changed zero. These are source limitations, not enriched content.
- Full cache refresh at **20:45:32 UTC** succeeded over 41 sources in 1,980 ms: **135,782 total = 127,686 findings + 8,096 decisions**. Queues: business quality 72,560; event quality 35,785; general review 24,589; geography 1,869; staging 941; org links 19; tag enrichment 16; dedup review 3. The under-100 goal remains unachieved.
- Main PR #4548 introduced case-based review during this work. Its merge conflict was the two query invalidations; both were retained. The live searchable comparison is now also integrated into the default venue case page, with evidence-version-bound confirmation and current event timestamps. The existing case RPC passed the new rolled-back `matching_case_links.sql` test: actual link, stale case refusal, both source queue dispositions, inactive completed case and decision audit. No replacement mutation was needed.
- New focused UI checks pass, scoped ESLint passes, and the typecheck ratchet reports 698 existing errors with none new (baseline 782). Desktop/mobile actual-component previews have no horizontal overflow or browser exceptions and submit the chosen venue, all sibling findings and the live timestamp. Preview images are `outputs/matching-cases-desktop.png` and `outputs/matching-cases-mobile.png` in the task root. These are local fixture previews, not a production release verification.
- Applied `20261021205910_venue_comparison_source_address.sql` to keep the current source street address in the admin-only comparison response. The original rolled-back matching regression passed again with the explicit address presence/value assertion. Privileges and mutation behavior were unchanged.
- Event image request **57614** completed HTTP 200: 20 examined, 22 network requests, zero fills. Content request **57725** completed HTTP 200: 20 examined, 21 requests, zero fills and zero AI calls (daily cap 0). No media or description gap was falsely resolved; broad reruns of these zero-yield lanes are not the next useful action without further diagnosis.
