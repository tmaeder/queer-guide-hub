# Event Content Quality — Diagnosis & Improvement Strategy

_2026-06-07. P0 shipped (migration `20260607150000`); P1–P4 are the roadmap._

## Diagnosis (live, 2026-06-07)

Corpus: **3,626 events** (577 upcoming, 3,049 past, 319 dupes; 3,307 non-dup).
Quality is **bimodal** — text fields strong, structural/moat fields gutted:

| Field | % missing (pre-P0) | Lever |
|---|---|---|
| description / relevance | ~1% | already good |
| latitude/longitude | 8.1% | **P0** city centroid |
| timezone | 18.3% | **P0** `cities.timezone` |
| end_date | 57.9% | **P0** heuristic (single-instant types) |
| venue_id | 96.9% | **P0** exact match (132) + structural |
| images | 48.2% | P1 og:image (1,186 have a URL) |
| ticket/website URL | 54.7% | P3 web-search recovery |
| target_groups | 93.4% | P3 LLM |
| accessibility | 100% | P3 LLM |

Truth Loop is **input-starved**: `event_sources` covers only 796/3,626; corroboration provenance ~0%; liveness `unknown` on 92% of upcoming; scoring jobs paused.

## Root causes

1. **Source-shaped gaps.** Two sources = 58% of corpus, each missing one field wholesale (`worldnakedbikeride` 100% no image, `gaytravel4u` 100% no URL). Values were never captured at ingest and aren't in `event_sources` → not a free SQL fix.
2. **URL cascade.** No URL → no liveness → no agentic grounding → single-source corroboration. Half the corpus is locked out of the Truth Loop by one field.
3. **Enrichment can't scale.** `event-agentic-enrich` caps at 50/day vs thousands needing it.
4. **Truth Loop jobs paused** (`run_event_trust_recompute`, `run_event_coverage_radar`).
5. **No prevention** — each new ingest re-opens the same per-source gap.

## Roadmap

- **P0 — Free structural backfills + measurement. ✅ SHIPPED.**
  Migration `20260607150000_event_field_coverage_and_backfills.sql`:
  `event_field_coverage()` metric (per-source + ALL rollup) + backfills.
  Results: geo missing 8.1%→**0.0%**, end_date 57.9%→**25.6%**, tz 18.3%→**10.6%**,
  venue links 61→**193**, null-island 0, search index intact (3,307/3,307).
- **P1 — quality_score recompute + og:image harvest. ✅ SHIPPED.**
  - `run_event_completeness_recompute()` (migration `20260607160000`) recomputes
    `events.quality_score` from live columns (rubric mirrors pipeline-quality-score,
    tags→end_date). **avg quality 33.8→78.7**; after `run_event_trust_recompute`,
    **upcoming trust 50.5→61.3**, q<40 = 0. This was the high-value half.
  - `event-image-backfill` edge function (`verify_jwt=false`, gated by the
    `event_quality_webhook_secret` Vault secret like the sibling event-quality
    fns) scrapes each event's OWN og:image. Weekly cron `event_image_backfill`
    (migration `20260607170000`); drained the backlog on rollout (~80 imaged,
    88% hit on real per-event URLs). Dead `enrich-event-images` cron (pointed at
    consolidated-away `fetch-event-images`, 404) removed.
  - **Honest scope correction:** the "1,186 events with a URL" was misleading —
    1,071 are World Naked Bike Ride all pointing at the same `worldnakedbikeride.org`
    homepage (no og:image, no per-event page). og:image only ever addressed the
    ~110 real per-event-page events. The bulk image gap is unmoved.
- **P1.5 (NEW, deferred) — bulk image for no-scrapable-URL events.** The real
  image gap is the **1,071 WNBR** (assign one shared WNBR photo via SQL, or
  `fetch-images` Wikimedia search) + **~560 events with no URL** (`fetch-images`
  entity_type=event stock/wiki art). This replaces the stock-image intent of the
  retired `enrich-event-images` cron.
- **P2 — Truth Loop enrichment. ✅ SHIPPED (with a hard finding).**
  - All five Truth Loop crons were **already active** (the "paused" note was
    stale) — nothing to re-enable.
  - `event-agentic-enrich` retargeted: selector RPC `events_needing_moat_enrich`
    (migration `20260607190000`) replaces the `trust_score<40` filter (which my
    P1 quality recompute had starved, and which re-ran the same ~62 events 314×).
    Now targets events missing a moat field with a per-event URL, **excludes
    recently-attempted** (no more spin), excludes the WNBR homepage. Cap 50→60,
    self-terminating across the ~551 untouched URL-events.
  - **Hard finding — moat fields are NOT page-extractable.** Even `done`
    enrichments leave `accessibility_attributes` at **0%** and `target_groups`
    unchanged: LGBTQ+ event source pages essentially never state accessibility or
    audience, and grounded extraction (correctly) won't invent them. Scaling LLM
    spend here is a dead end. Enrichment's real residual value is
    description/safety_notes/lineup, so the cap stays modest.
- **P2.5 (NEW) — real path to accessibility / target_groups** (since pages can't
  supply them): (a) **inherit accessibility from the linked venue** once
  venue-linking improves (blocked today by 94% null `venue_id`); (b) a
  **community/admin capture** affordance on `/admin/events`; (c) a *careful,
  reviewed* rule-based `target_groups` pass from `event_type` + title keywords
  (sensitivity risk — mislabeling audience — so human-gated, not auto-applied).
- **P3 — URL recovery + accessibility/target_groups LLM waves (whole corpus).**
  Derive official URLs via web search (title+city), validate with
  `_shared/link-health.ts` `probeLink`, then run `researchEnrichEventFromPage()`
  for the moat fields. Big-spend, highest-moat.
- **P4 — Prevention.** Per-source completeness validators in
  `pipeline-review-gate` + per-source coverage panel wired to
  `event_field_coverage()` in `EventQualityPanel`.

## Open / deferred

- 349 events have a `city_id` whose city itself lacks a `timezone` → backfill `cities.timezone` (cities-data task).
- `end_date` for `other`/festival/pride/conference left null deliberately (multi-day or ambiguous) → P3 LLM.
- Raising agentic-enrich caps = recurring cost; set explicit daily budget at P2 start.
