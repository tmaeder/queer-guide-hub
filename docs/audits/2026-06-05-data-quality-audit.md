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

**🟢 Running now (background, supervised, resumable):**
- **Venue geocoding** — `scripts/backfill-venue-geocode-photon.mjs`. Country-validated Photon, ~25 venues/min, ~71% located, ~16% rejected as cross-country mislinks. ~10.2k queued, ETA ~6–7h.
- **Personality Wikidata-by-QID enrichment** — `scripts/backfill-personality-wikidata.mjs`. ✅ **DONE** (2,886 processed): +491 nationalities; **~14% (~400) of QIDs are wrong** (point to given-name/disambiguation items, not humans) → flagged `needs_attention`; birth-date yield ~0 — Wikidata genuinely lacks day-precision births for this obscure cohort (finding: poor Wikidata coverage + bad QID linkage). Day-precision-only gate kept (no fake `YYYY-01-01`).

Both write per-row via the Management API (bulk venue/personality writes time out on the `search_documents_sync` reindex trigger) and self-restart on DNS/network blips.

**⏭️ Remaining (need geocode to finish, or edge-fn / LLM budget):**

| Job | Count | Driver |
|-----|------|--------|
| Venue city-link (post-geocode) | ~6,283 | reverse-geocode / city-text match after coords land |
| Event geocoding | 1,855 | same Photon client |
| Event liveness sweep | ~440 upcoming | **blocked**: only 3 upcoming-unknown events have a ticket/website URL to check |
| News full-text backfill | 7,628 | shipped extraction over pre-2026-05-30 corpus |
| News geo-tagging | 16,676 | `pipeline-enrich-news` geo step (LLM) |
| Real LGBTQ+ classification | all types | LLM classifier (cost) — replaces the default index score |
| Personality name-only enrichment (no QID) | ~7,500 | needs safe disambiguation — name matching alone is unsafe |
| Images + descriptions | venues 97%, pers 79% | highest cost; queue via `venues_due_for_refresh` + agentic-enrich |

**Operational guards:** prod DB is disk-constrained (~5.8 GB, read-only trips near ~6.7 GB) — size-check before bulk writes that add content/embeddings; respect Photon rate limits; verify on https://queer.guide after each batch.

## Phase B — second session (event + news), 2026-06-05

**✅ Event geocoding — DONE.** `scripts/backfill-event-geocode.mjs`. **Live events with coords: 1,452/3,307 (44%) → 3,307/3,307 (100%)**, 0 remaining, 0 out-of-range/null-island.
- Key finding that reshaped the approach: all 1,855 missing-coord events *already* carried a correct `city_id` (→ `country_id`), and every linked city had coords. Only **31** events had a street address or `venue_name` worth precise geocoding; **1,824 were city-level** (Pride, street fairs, NYE parties).
- Pass A (Photon, country-validated, reject `countrycode ≠ event.country`): 31 → **30 precise**, 1 no-result, 0 rejected.
- Pass B (city-coord inherit, country-safe by construction since `city_id` was already resolved): **1,825** events given city-center coords.
- `trg_event_geocode` (pg_net→Nominatim reverse-geocode) was **not** triggered — its `WHEN (NEW.city_id IS NULL)` guard holds for all rows, so no external fan-out. `latitude IS NULL` is the natural resume cursor (every row has a city fallback → job is idempotent + terminating).

**✅ News full-text backfill — DONE.** `scripts/backfill-news-fulltext.mjs` under `scripts/run-supervised.sh` (detached). Re-fetched the URL of each thin live article (`content < 120` chars, 7,658) and recovered the body via a **faithful jsdom port of the shipped `_shared/news-quality/extract.ts`** (JSON-LD `articleBody` → `<article>` → `<main>` → densest `<p>`-cluster). Conservative swap (≥250 chars AND ≥1.2× current), never blanks on 404/paywall/non-HTML.
- **Result: 7,658 processed → 5,080 extracted (66%), 2,577 skipped (paywall/404/non-HTML/no-gain), 1 failed.** Single supervisor run, 0 restarts. **Live-news content coverage 54% → 84.6% (14,174/16,752).** The 2,578 still-thin are genuinely unextractable over HTTP (hard paywalls / dead links).
- **DB growth +90 MB only** (5,794 → 5,884 MB) — nowhere near the 6,300 MB guard.
- **Realized value (important nuance):** news detail pages are *intentionally* gone (headlines link to publishers), and `search_documents_index_news` builds the keyword `search_tsv` from **title + category + excerpt only — not `content`**. So the win is via (a) **excerpt** (indexed weight-D + shown as the search-result description; ~839 thin rows had none), and (b) **semantic search** — a content-change trigger **re-embeds** automatically (now 16,719/16,752 live news carry embeddings, 99.8%), so the fuller body improves vector recall even though it isn't in the tsvector. Content also feeds quality-scoring + dedup fingerprints and brings the pre-2026-05-30 corpus to new-pipeline parity. Side-effect to note: this triggered ~5k re-embeddings (existing automatic lifecycle, not a new LLM cost line).
- **Known limitation:** the density fallback occasionally captures trailing boilerplate (e.g. a "Related Categories" rail) on sites with thin article markup — same behavior as the shipped extractor; left faithful. The excerpt (taken from the top lead paragraph) is unaffected.
- Resumable id-keyset cursor (`scripts/output/news-fulltext.cursor`), disk-guarded (exit 42 at 6,300 MB), per-row writes.

**✅ News geo-tagging — conservative pass DONE (310 of ~16,725 empty `country_ids`).** Decision: a broad text pass is **not** safe (sampled bare-country-name-in-title matching ran only ~80% precision — proper-noun collisions like "Tom of Finland"→Finland, publisher names, demonym-as-person). Two confident slices were applied instead, leaving the bulk for the LLM geo step:
- **11 deterministic** — articles already carrying `city_ids` → `country_ids` derived from `cities.country_id`. Zero risk.
- **299 governance-gated** — title contains exactly **one** unambiguous country name (length ≥4; hard stoplist drops state/word collisions: Georgia, Turkey, Jordan, Chad, Guinea, Niger, Cuba, Chile, Hungary, …) **AND** a legislative/governmental cue (`pass|ban|repeal|decriminali|criminali|legali|parliament|lawmaker|senate|court|ruling|president|government|bill|constitution|referendum|crackdown|…`). Two systematic false-positive patterns patched out: "Northern Ireland"→Ireland, and publisher suffixes ("Free Malaysia **Today**"→Malaysia on a Hungary story). Sampled precision ~95%+; this slice is exactly the core anti/pro-LGBTQ legislation-by-country content. Verified: Ghana/Botswana/Senegal/India/Russia tagged correctly; NI + publisher cases correctly left empty.
- **167 tag-based** (added after full-text run) — author-assigned `tags` containing exactly one unambiguous country name **or** a US-state name (→ US), single-distinct-country guard. Sampled 100% correct (state tags like `pennsylvania`/`idaho`/`florida` → US; `australia`/`brazil`/`canada`/`russia` tags → those countries). Tags are sparse though — only ~150 net.
- **Tagged live news: 27 → 504.** All three safe signals (city_ids, governance-gated title, author tags) are now **exhausted**. Remaining **16,311** empty → **deferred to `pipeline-enrich-news` LLM geo step** (needs body comprehension + relevance, not keyword/tag matching). Reversal if ever needed: clear `country_ids` on rows where the single value matches a matcher and `updated_at` falls in the apply window.
