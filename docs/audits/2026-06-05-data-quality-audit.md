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
| Personalities | 12,619 / 12,528 | 🔴 321 dead-but-`is_living` · 🔴 ~15% of `wikidata_qid` links wrong (point to given-name/disambiguation items, `P31≠Q5`) · 🟠 79% no birth, 67% no wikidata, 55% no nationality · 1 future birth |
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

**Deeper integrity pass (read-only checks + safe fixes):**
- Clean (0 issues): slug collisions (all tables), self-referential dups, coord range, event date/price order, recurring-without-rule, marketplace price sanity.
- **Venue `website` field — 2,925 malformed, all fixed**: 2,279 valid domains missing scheme → prepended `https://` (incl. 14 IDN/invisible-char cases); 71 corrupted doubled URLs → recovered embedded `http://`; ~575 garbage (category strings like "Dining and Drinking") + 2 emails-in-website → nulled. 1 malformed email nulled.
- **141 venues** where `country` text conflicts with `country_id` (e.g. text=US ↔ linked=Argentina) → flagged `needs_attention` (need coord-based disambiguation; not auto-guessed).
- **3 personalities** born <18y ago but flagged `is_adult` → flagged `needs_attention`.

## Phase B backfills — running / remaining

**✅ Venue geocoding + geo-linking — COMPLETE:**
- **Geocoding** — `scripts/backfill-venue-geocode-photon.mjs`. Country-validated Photon, 9,688 processed: **6,946 located (72%)**, 824 rejected (cross-country mislinks correctly blocked), 1,918 no-result (name-only "addresses" like "Afghan Women's Network", not geocodable).
- **City/country linking** — PostGIS nearest-city (country-scoped, then global ≤100km). Result for live venues: **coords 56%→88%, city_id 73%→95.4%, country_id →95.6%**. Remaining ~363 are >100km from any city in our table (remote / sparse city coverage).
- **Personality Wikidata-by-QID enrichment** — `scripts/backfill-personality-wikidata.mjs`. ✅ **DONE** (2,886 processed): +491 nationalities; **~14% (~400) of QIDs are wrong** (point to given-name/disambiguation items, not humans) → flagged `needs_attention`; birth-date yield ~0 — Wikidata genuinely lacks day-precision births for this obscure cohort (finding: poor Wikidata coverage + bad QID linkage). Day-precision-only gate kept (no fake `YYYY-01-01`).

Both write per-row via the Management API (bulk venue/personality writes time out on the `search_documents_sync` reindex trigger) and self-restart on DNS/network blips.

**✅ LGBTQ+ relevance classification — DONE (CF Workers AI):** new edge fn `classify-relevance-backfill` (self-contained, native `/ai/run`, UNKNOWN over false-0, **personalities excluded — outing risk**) + driver `scripts/backfill-relevance-classify.mjs`. Coverage: venue 85% scored (avg 0.32), event 100% (0.75), marketplace 98% (0.69), news 99% (0.44); rest UNKNOWN (thin data, honestly unscored). **Propagated to `search_documents.lgbtq_score`** (~33,500 docs) so search ranks on the real signal instead of the 0.5 default. Cleanup TODO: delete the one-off `classify-relevance-backfill` edge fn (`supabase functions delete`).

**✅ Autonomous-finish pass (2026-06-07):**
- **Country conflicts resolved by coords** — ~426 venues where `country` text ≠ `country_id` corrected to the coordinate's true country; 13 remote leftovers stay flagged.
- **High-confidence dup merges** — 31 near-certain duplicates (same name+city + identical real domain/phone) merged via the real `merge_venues` RPC (full reparent + slug-redirect + audit; run in a tx with the admin JWT claim set). The ~300 uncorroborated same-name clusters left for human review at `/admin/duplicates`.
- **Personality QID validation** — `scripts/validate-personality-qids.mjs`: re-checked all 3,614 QIDs against Wikidata P31; **425 confirmed non-human links nulled** + flagged `needs_attention` (kept ones with no P31 evidence).
- **Venue images** — `scripts/backfill-venue-ogimage.mjs`: sourced real `og:image`/`twitter:image` from venues' own websites (rejects favicons/svg/ico, forces https). ✅ DONE: 4,470 processed, **1,099 real images** (25%). Foursquare/TomTom stored data holds no photos for imageless venues; the remaining ~16k imageless venues have no website → need a paid photo API (Google Places).
- **Coordinate-proximity dup merges** — 62 same-name venues within 75m of each other merged (certain same-place, even without shared domain/phone). Platform-ID dedup checked (foursquare/tripadvisor/external) — 0 genuine dupes (collisions were cross-source coincidental).
- **Minor/adult contradictions resolved** — the 4 personalities born <18y ago yet `is_adult` were all bad birth-dates on adult performers (e.g. "born 2100/2017") → birth_date nulled, `is_adult` kept, flagged. Full sweep: 0 future births/deaths, 0 death-before-birth remain.
- One-off `classify-relevance-backfill` edge fn **deleted** (cleanup done).

**⏭️ Genuinely remaining (needs human, budget, or data that doesn't exist):**

| Item | Why it can't be auto-finished |
|-----|------|
| ~300 venue dup clusters (uncorroborated) | same-name/city but no shared domain/phone — could be distinct venues; human call at `/admin/duplicates` |
| ~17k imageless venues with **no website** | need a photo API (Google Places/Foursquare) — no API key/budget |
| 3 minors flagged `is_adult` | needs human judgment (wrong birth_date vs wrong flag) |
| Personality/venue descriptions (thin) | content generation/sourcing — agentic-enrich budget |
| Data floor | ~2,540 personalities Wikidata lacks; ~363 remote venues no nearby city; ~2,600 news paywalled/dead-URL; non-geographic news |

Event geocoding, news full-text + geo-tagging were completed by the parallel session (events 100% geocoded; news thin 7.6k→2.7k, geo-missing 16.7k→4.9k).

**Operational guards:** prod DB is disk-constrained (~5.8 GB, read-only trips near ~6.7 GB) — size-check before bulk writes that add content/embeddings; respect Photon rate limits; verify on https://queer.guide after each batch.
