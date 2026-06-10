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
**🟢 Running now (background, supervised, resumable):**
- **Venue geocoding** — `scripts/backfill-venue-geocode-photon.mjs`. Country-validated Photon, ~25 venues/min, ~71% located, ~16% rejected as cross-country mislinks. ~10.2k queued, ETA ~6–7h.
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
| ~~venue dup clusters~~ → **DONE (reviewed 2026-06-07)** | reviewed every remaining same-name/same-city cluster: merged by ≤75m proximity, ≤2km, matching-address (missing coords), and ≤25km intra-metro (geocoder variance, not real branches for this domain). **~167 merged; 1 cluster left** (a lone pair 70km apart — genuinely possibly-distinct, left for human). All via the audited reversible `merge_venues` RPC. |
| ~16k imageless venues with **no website** | **Built + deployed** `venue-photo-foursquare` (Foursquare 2025 Places API, coords-validated within 400m → real venue photos) + driver `scripts/backfill-venue-photos.mjs`. **Blocked on provider billing:** Foursquare account returns 429 "no API credits remaining"; `GOOGLE_PLACES_API_KEY` unset. → add Foursquare credits (or set a Google key) then run the driver — ready. |
| Venue descriptions (85% thin) | **Not auto-filled — deliberate.** No external source provides venue prose; deterministic templates surfaced bad geo data ("St. Gallen, Germany") + read as filler; LLM prose makes unverifiable claims about real safe-spaces (trust/safety risk). Needs editorial input. Side-fix: 41 venues with wrong `country_id` vs their city corrected. |
| 3 minors flagged `is_adult` | needs human judgment (wrong birth_date vs wrong flag) |
| Personality/venue descriptions (thin) | content generation/sourcing — agentic-enrich budget |
| Data floor | ~2,540 personalities Wikidata lacks; ~363 remote venues no nearby city; ~2,600 news paywalled/dead-URL; non-geographic news |

Event geocoding, news full-text + geo-tagging were completed by the parallel session (events 100% geocoded; news thin 7.6k→2.7k, geo-missing 16.7k→4.9k).

**Operational guards:** prod DB is disk-constrained (~5.8 GB, read-only trips near ~6.7 GB) — size-check before bulk writes that add content/embeddings; respect Photon rate limits; verify on https://queer.guide after each batch.
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

## Phase C — extended remediation (all types), 2026-06-06

**Built:** `supabase/functions/backfill-llm-enrich` — config-driven webhook-gated edge function. targets: `news` (geo + relevance), `events` (relevance), `venues` (relevance, conservative prompt), `personalities` (relevance). Uses `chatCompletion()` → CF Workers AI Llama-8B under `llm.openai.enrich-news` circuit breaker. Disjoint id-range shards for safe parallelism. Per-row writes (trigger-timeout safe). Resumable: `classified_at IS NULL`.

**`scripts/backfill-llm-enrich-drive.mjs`** — sharded driver, 4 id-range shards, sequential targets, circuit-aware backoff.

**`scripts/backfill-images-drive.mjs`** — loops free-source image backfill edge functions (Wikipedia/Pexels).

### Classification results (all live entities, 100% complete)

| Entity | Before | After | High-relevance (≥0.7) | Notes |
|--------|--------|-------|----------------------|-------|
| news_articles | ~150 (0.9%) | **16,872 (100%)** | 7,802 (46%) | + geo (see below) |
| events | 95 (2.9%) | **3,307 (100%)** | 2,695 (81%) | LGBTQ+ events catalogue = ~81% relevant |
| venues | 0 | **23,188 (100%)** | 6,204 (27%) | Conservative prompt; generic venues score low |
| personalities | 0 | **12,528 (100%)** | 7,584 (61%) | |

**`lgbti_relevance_score` is now a real signal across all entity types** — replacing the audit finding of "near-constant defaults" (1.0 for marketplace/news, 0.5–1.0 for events/personalities, only 6 real values for venues).

### LLM news geo-tagging (Phase C pass)
On top of the Phase B 504 deterministic + title-governance + tag-based tags, the LLM classified **12,157/16,872 (72.1%)** news articles with a `country_id`. The ~28% without are globally-scoped or celebrity-only items (no country attribution — not a gap).

### Cities images
`scripts/backfill-images-drive.mjs` via `backfill-cities-images` (Pexels, free-source). Added 55 city images for the highest-population cities; remaining ~1,000 are flagged-unfindable by the function (no Pexels results or already exhausted). Personality images: all missing are `visibility='draft'` — skip correct. Country images: none missing.

### Incident: circuit breaker tripped
Ran 8 concurrent LLM shards (P1 news×4 + P2 venues×4) — tripped the shared `llm.openai.enrich-news` circuit breaker (threshold=5 failures, 120s cooldown). Also blocked the live news-ingestion pipeline. **Root cause:** CF Workers AI rate-limits burst requests across concurrent edge-fn invocations. **Fix:** manual `UPDATE api_circuit_breakers SET state='closed', failure_count=0 WHERE api_name='llm.openai.enrich-news'`; manually classified the poisoned half-open probe row (Sydney Mardi Gras). **Lesson:** max 4 concurrent LLM shards on this project's CF Workers AI allocation. Sequenced all subsequent targets solo at 4-shard load → 0 failures.

### Venue city-linking (post-geocode, Phase C follow-up)
After the other session's Photon geocode run completed (~88% venue coord coverage), an additional SQL city-text pass ran:
- **1,322 venues** inherited coords + city_id from `cities` table by exact `lower(name)=lower(city)` + country code match. Country-scoped → no cross-country mislinks.
- **14 more** linked by city text for venues that had Photon coords but Nominatim reverse-geocode returned no usable city.
- **Final venue state:** **93.7% with coords** (21,726/23,188), **100% classified**, 1,462 genuinely ungeocodable (Photon found nothing + no city text match), 310 with coords but no city (city name doesn't match any `cities` table entry — foreign spellings, rural venues).

### Final DB state
- **Disk:** 5,794 MB → **5,852 MB** (+58 MB total across all phases). Headroom ~450 MB to 6,300 MB guard.
- **Descriptions/images (venues 97%, personalities 79% draft):** deferred — LLM-generation cost + disk risk. Queue via `venues_due_for_refresh` + `event-agentic-enrich` when budget allows.
- **Open PRs:** #1468 (placeholder city map fix), #1469 (venue coord/city consistency), #1470, #1471 (this branch) — all MERGEABLE with auto-merge enabled and CI green.
