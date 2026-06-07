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
- **P1 — og:image harvest + event quality_score recompute.**
  Scrape og/twitter:image for the 1,186 events with a URL but no image (reuse
  `_shared/image-assets.ts`, og logic in `backfill-news-images`). Add
  `run_event_completeness_recompute()` so filled fields actually lift
  `quality_score` → `run_event_trust_recompute` then reflects P0/P1 gains.
- **P2 — Reactivate + scale the Truth Loop.** Re-enable the two paused SQL jobs;
  raise `event-agentic-enrich` cap + broaden target to "missing accessibility OR
  target_groups"; run liveness against `website` too; emit a single-source
  corroboration floor for legacy events.
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
