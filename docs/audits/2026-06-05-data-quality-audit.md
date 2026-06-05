# Data-Quality Audit — All Content Types (2026-06-05)

Live audit against prod (`xqeacpakadqfxjxjcewc`). Counts are real, not estimates.

## Healthy baseline
- **Referential integrity: clean** — 0 FK orphans (venue/event/city/personality links).
- **Search index: 100% coverage** of live entities, embeddings 100% populated.

## Findings (severity: 🔴 critical · 🟠 high · 🟡 medium)

| Type | Total / Live | Key issues |
|------|-----|-----|
| Venues | 32,756 / 23,188 (9,568 merged) | 🔴 58% no coords · 🔴 97% no images · 🟠 450 unresolved dup clusters + 743 dup→dup chains · 🟠 `verification_status` dead (all 'unverified') · 🟡 85% thin desc |
| Events | 3,626 / 3,307 | 🔴 98% liveness unknown · 🟠 140 active-but-past · 93% no venue · 59% no coords · 🟡 3 end<start |
| News | 17,130 / 16,703 | 🔴 99.8% no geo tags · 🟠 45% thin content · 🟡 29% no image, 23% qs null |
| Personalities | 12,619 / 12,528 | 🔴 321 dead-but-`is_living` · 🟠 79% no birth, 67% no wikidata, 55% no nationality · 1 future birth |
| Marketplace | 6,532 | 🟠 58% thin desc, 30% no images · 🟡 17 no price, 3 price≤0 (cleanest type) |
| Cities | 3,876 | 🟠 21% no coords, 47% no population · 🟡 89% thin desc |
| Countries | 250 | 🟡 `description` empty for all (content in `editorial_long`); 11 no equality_score |
| Tags | 8,106 | 🟠 96% zero-usage; only 243 have real assignments; 5,435 true orphans · all `human_reviewed=false` |

### Cross-cutting
- **Real LGBTQ+ classification never ran at scale.** `classified_at` set on ~150 venues / ~95 events only. The search index's `lgbtq_score` is a near-constant default (marketplace & news all 1.0; events/personalities 0.5–1.0; only venues have 6 real values) — **not** a substitute for real classification. Base-table `lgbti_relevance_score` is null almost everywhere.
- **Reference/geo types ranked at quality 0** in search (cities, countries, tags, queer_villages were never quality-scored).
- Note: the live-venue country-link gap is small; the large 12k figure was inflated by merged duplicates.

## What was fixed this pass (applied to prod, all reversible)

**Phase A — correctness (verified → 0 remaining):**
1. 321 dead personalities `is_living=false`; 1 future birth_date nulled+flagged; 3 events `end_date<start_date` nulled+flagged.
2. 743 venue dup→dup chains flattened to terminal canonical (max depth 5, no cycles).
3. 140 active-but-past non-recurring events → `status='completed'`.
4. ~~Back-write relevance~~ **skipped** — index score is a default, would inject noise (see cross-cutting).
5. `unified_tags.usage_count` recomputed (46 corrected); 5,319 orphan tags soft-deprecated (no assignments/relations/synonyms/aliases). Search index auto-pruned to 2,605 active tag docs.

**Phase B — SQL-resolvable slice:**
6. Geo-linking (country-scoped to avoid cross-country mislinks): 36 venues country-linked, 5 city-linked. Remaining city gap needs reverse-geocoding (no matchable text).
7. Reference-type quality scoring written to the search index: cities (avg 40), countries (avg 59), tags (avg 78) — no longer pinned at rank 0.

## Remaining Phase B backfills (external/async — run as monitored jobs)

These need rate-limited APIs / LLMs / deployed edge functions and span sessions. Sizes (live entities):

| Job | Count | Driver |
|-----|------|--------|
| Venue geocoding | 10,260 | rate-limited Photon client (country-validated; client script, not pg_net bursts) |
| Venue city-link (post-geocode) | 6,283 | reverse-geocode after coords land |
| Event geocoding | 1,855 | same Photon client |
| Event liveness sweep | 3,238 | `event-liveness-checker` edge function |
| News full-text backfill | 7,628 | shipped extraction over pre-2026-05-30 corpus |
| News geo-tagging | 16,676 | `pipeline-enrich-news` geo step |
| Real LGBTQ+ classification | all types | LLM classifier (cost) — replaces the default index score |
| Personality enrichment (birth/wikidata/etc.) | 9,907 | wikidata/agentic enrich, traffic-weighted via `personality_data_health` |
| Images + descriptions | venues 97%, pers 79% | highest cost; queue via `venues_due_for_refresh` + agentic-enrich |

**Operational guards:** prod DB is disk-constrained (~5.8 GB, read-only trips near ~6.7 GB) — size-check before bulk writes that add content/embeddings; respect Photon rate limits; verify on https://queer.guide after each batch.
