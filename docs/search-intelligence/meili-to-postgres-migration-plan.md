# Meilisearch → Postgres + Cloudflare migration & search-assistant plan

**Status:** Proposal / planning
**Branch:** `claude/meilisearch-cloudflare-migration-03DFP`
**Scope:** Replace self-hosted Meilisearch with a Postgres (pgvector + FTS) + Cloudflare Workers
combination, preserve and deepen personalization, add a grounded conversational concierge
assistant, and fold in a set of relevance/safety/observability enhancements.

This doc is strategic. The numbered `01–06` series in this directory describes the **current**
Meili-based search-intelligence design; this plan describes the move **off** it.

---

## 1. Why

The current stack fuses two engines in the `search-proxy` Worker:

- a **vector / semantic half** — `content_embeddings` (pgvector, 1024-dim HNSW, `bge-m3`) queried
  via the `personalized_semantic_search` RPC, plus a *duplicate* OpenAI 1536-dim embedding inside
  Meili; and
- a **structured keyword + facet + geo half** — Meilisearch (self-hosted on Infomaniak via
  `docker-compose` + Caddy), kept in sync by the `meilisearch-sync` edge function (~1056 lines) +
  pg_net triggers + reconcile/tombstone sweeps.

Embeddings (`@cf/baai/bge-m3`) and reranking (`@cf/baai/bge-reranker-base`) already run on **Workers
AI** behind the `qg-search` AI Gateway. RRF fusion, personalization, synonym expansion, and
`distinctAttribute` dedup are already Worker-side. So the only things truly outsourced to Meili are
BM25 keyword matching, faceting, geo, typo tolerance, ranking rules, and the second embedding copy —
all of which Postgres can do **natively and better** (facet counts via `GROUP BY`, geo via PostGIS,
highlighting via `ts_headline`, typo via `pg_trgm`).

**The prize is operational:** delete a self-hosted SPOF, the entire sync pipeline, and the
dual-embedding inconsistency — not chase a feature we lack.

### Why not Cloudflare Vectorize / AI Search as the primary engine

- **Vectorize** is a vector DB only: no BM25, no facet *counts*, no native geo radius/distance sort,
  no typo tolerance. It can hold the semantic half (10M vectors, ≤1536 dims, metadata filters
  `$eq/$ne/$in/$nin/$lt/$lte/$gt/$gte`) but can't be the structured engine. Reserve it as a later
  scaling lever (see §14).
- **AI Search (AutoRAG)** is a managed *document/chunk RAG* product (vector + BM25 hybrid, relevance
  boosting, metadata filters, MCP). Wrong shape for faceted, geo, card-based **entity** search — but
  the **right** shape for the assistant's knowledge/RAG tool over unstructured editorial/news/guide
  content (see §7, Phase 7).

---

## 2. End-state architecture

```
Frontend:  /search (cards UI, unchanged contract)   +   /assistant (chat + concierge, NEW)
                                                            │  SSE stream
                                                            ▼
                   Assistant Worker  ──  Durable Object (per-conversation memory)
                                                            │  Claude (Haiku router → Sonnet synth) via AI Gateway
                                                            │  tool-calling:
                                                            ├─ search_hybrid()       → structured/faceted/geo/trust-ranked  (Postgres)
                                                            ├─ get_entity_details()  → full venue/event/hotel record         (Postgres)
                                                            ├─ get_recommendations() → personalized concierge feed           (Postgres)
                                                            ├─ knowledge_search()    → RAG over guides/news/safety            (CF AI Search)
                                                            ├─ plan_trip()/save_trip()→ itinerary CRUD                        (Postgres trips)
                                                            └─ safety_briefing()     → TripSafetyBriefing data               (Postgres)
                                                            ▼
search-proxy Worker (orchestrator, mostly unchanged) ── Postgres (search_hybrid + pgvector + personalization)
                                                            ⊕  CF AI Search (editorial RAG)
```

**Dies:** Meili node (Infomaniak docker-compose + Caddy), `meilisearch-sync` + its triggers +
reconcile crons, the OpenAI 1536-dim embedder, `workers/search-proxy/src/meili.ts`, the
`meilisearch/` config dir, `configure-*.sh`.

**Preserved (zero frontend change):** the exact `/search` request/response contract — `hits[]`,
`facetDistribution`, `suggestions`, `totalHits`, `processingTimeMS`, `debug` — plus personalization,
reranking, synonyms.

**Guiding principle:** the Worker keeps its shape; we swap its two backends (Meili keyword + the
pgvector RPC) for **one** Postgres RPC, `search_hybrid`.

---

## 3. The Postgres search core

Today FTS is only the *deprecated* on-the-fly `universal_search()` with **no stored tsvector
columns**. We build the structured-search layer properly.

### 3.1 Extensions
`pg_trgm`, `unaccent`, `postgis` (geo columns are bare `numeric` lat/lng today — PostGIS gives true
`ST_DWithin` radius + `<->` distance sort; `earthdistance`/cube is the lighter fallback).

### 3.2 Searchable layer — two options (decision in §15)

**Option A — per-entity generated tsvector + GIN/GiST indexes** on each table, UNION-ed at query
time. Example for `venues` (live schema uses **`is_featured`**, not the dropped `featured`):

```sql
ALTER TABLE venues ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', unaccent(coalesce(name,''))), 'A') ||
  setweight(to_tsvector('simple', unaccent(coalesce(city,''))), 'B') ||
  setweight(to_tsvector('simple', unaccent(coalesce(category,''))), 'B') ||
  setweight(to_tsvector('simple', unaccent(coalesce(array_to_string(tags,' '),''))), 'C') ||
  setweight(to_tsvector('simple', unaccent(coalesce(description,''))), 'D')
) STORED;

CREATE INDEX venues_search_tsv_gin ON venues USING gin(search_tsv);
CREATE INDEX venues_name_trgm     ON venues USING gin(name gin_trgm_ops);
CREATE INDEX venues_geo_gix       ON venues USING gist (
  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
);
```

Repeat per entity using each index's searchable attributes from `configure-indexes.sh` (events add
`venue_name`/`event_type`; cities add `aliases`/`population`; news adds `published_at`; marketplace
adds `business_name`/`brand`; etc.). Stop words (`gay`, `queer`, `trans`, …) move into a custom FTS
dictionary or are stripped in the RPC.

**Option B — single denormalized `search_documents` table** (recommended, see §8 enhancement): one
wide table `(id, type, title, tsvector, embedding, facets jsonb, geo, trust_score, …)` maintained by
triggers/generated columns. The in-DB analog of a Meili index: uniform ranking across all 11 types,
one HNSW + one GIN index, trivial facet counts, one simple RPC. The "sync" is in-Postgres and
transactional — nothing like the Meili pipeline we delete.

### 3.3 `search_hybrid` RPC — replaces Meili + the two existing RPCs

```sql
search_hybrid(
  p_query           text,
  p_query_vec       vector(1024),
  p_bias_vec        vector(1024)     default null,
  p_bias_weight     real             default 0.3,
  p_content_types   text[]           default null,
  p_filters         jsonb            default '{}',   -- city, country, category, is_featured,
                                                     -- is_free, cluster_ids, date/price ranges
  p_lat             double precision default null,
  p_lng             double precision default null,
  p_radius_km       double precision default null,
  p_limit           int              default 100,
  p_lang            text             default 'simple'
) returns jsonb
```

Internally, per requested type:
- **Keyword leg:** `search_tsv @@ websearch_to_tsquery(...)` ranked by `ts_rank_cd`, OR'd with
  `similarity(name, q) > 0.2` for **typo tolerance** (replaces Meili edit-distance) and non-Latin/alias hits.
- **Vector leg:** reuse `content_embeddings` HNSW cosine, blending query+bias vec exactly as
  `personalized_semantic_search` does today (generalize that function, don't reinvent).
- **Filters:** WHERE from `p_filters` (the Meili `filterable` attrs).
- **Geo:** `ST_DWithin(geog, point, radius)` + `ORDER BY geog <-> point` (Meili `_geoRadius` parity).
- **Fusion:** RRF at depth 60 (in SQL — decision in §15).
- **Dedup:** `DISTINCT ON (master_event_id)` (replaces Meili `distinctAttribute`).
- **Highlighting:** `ts_headline` for `<em>` spans.
- **Trust-aware ranking** (enhancement, baked in — see §8.1): bias the final `ORDER BY` by
  `trust_score` / `liveness_status` / `last_verified_at`.

A companion `search_facets(...)` RPC (or a CTE in the same call) does `GROUP BY` over the filtered
set → `facetDistribution` in the current shape: `{ "city": {"Berlin": 45, …}, "category": {…} }`.

### 3.4 Feature-parity matrix

| Meili feature | Postgres replacement |
|---|---|
| Hybrid (keyword+semantic) | FTS+trgm ⊕ pgvector, RRF — in `search_hybrid` |
| Facet counts | `search_facets` `GROUP BY` (Vectorize can't) |
| Geo radius + distance sort | PostGIS `ST_DWithin` + `<->` |
| Typo tolerance | `pg_trgm` similarity |
| Custom ranking (date/pop/recency) | `ORDER BY` tie-breaks |
| Highlighting | `ts_headline` |
| Synonyms | unchanged (Worker `pgSynonyms` + LLM rewrite) |
| `distinctAttribute` (occurrences) | `DISTINCT ON (master_event_id)` |
| Stop words | FTS dictionary / RPC strip |
| Multi-index federation | `UNION ALL` / `search_documents` table |
| Multilingual | `unaccent` + retained `aliases` columns + `bge-m3` |

---

## 4. Worker changes (`search-proxy`)

- Replace `meili.ts` with `pgSearch.ts` calling `search_hybrid` + `search_facets` via the existing
  PostgREST RPC path (`supabase.ts` already does RPCs).
- **Unchanged:** query embedding (Workers AI `bge-m3`), synonym expansion, LLM rewrite, bias vector,
  `personalizedRank()`, `bge-reranker`, dedup, session/KV, rate limiting, analytics logging.
- `/autocomplete` → keyword-only `search_hybrid` (trigram prefix, small limit) or a dedicated
  `autocomplete()` RPC for <40ms.
- `/similar` → direct `content_embeddings` cosine query (drop Meili).
- `/trending` → already DB-backed; unchanged.
- Add **Hyperdrive** in front of Supabase (pool connections + edge-cache hot reads). The semantic leg
  already makes this hop today — no *new* hop introduced.

---

## 5. Migration phases (structured search)

- **Phase 0 — Baseline & safety net.** Freeze a golden query set (~200 queries across 11 types / 4
  langs / geo / facets) from `/admin/analytics` + `log_search`. Record current Meili top-20 + facet
  counts as a relevance baseline. Add a `SEARCH_BACKEND` flag (`meili` | `pg` | `shadow`).
- **Phase 1 — Postgres core.** One additive migration: extensions, tsvector columns (or
  `search_documents`), `search_hybrid` + `search_facets` RPCs, **trust-aware ranking baked in**.
  Mind the migration count; no `CONCURRENTLY` inside the txn (build large indexes in a tolerant or
  separate step).
- **Phase 2 — Worker rewrite.** `pgSearch.ts`, Hyperdrive binding, endpoint swaps. Keep all
  orchestration.
- **Phase 3 — Shadow mode & validation.** `SEARCH_BACKEND=shadow`: serve Meili, run PG in parallel,
  log both. Diff vs the Phase-0 baseline (overlap@10, zero-hit rate, facet accuracy, p50/p95) until
  PG ≥ Meili. Validate hard cases: "berlin"≠"leipzig" (tight similarity threshold), non-Latin
  aliases (München/東京), LGBTQ+ stop-word noise.
- **Phase 4 — Cutover.** Flip `SEARCH_BACKEND=pg` (instant rollback to `meili`; Meili stays up).
  Monitor on **production** (queer.guide), not just localhost.
- **Phase 5 — Decommission.** Delete `meilisearch-sync` + triggers + reconcile crons, `meili.ts`,
  `meilisearch/`, `configure-*.sh`, Meili env vars; shut down the Infomaniak node; update CLAUDE.md.

---

## 6. Conversational concierge assistant

A new `/assistant` endpoint: conversation state in a **Durable Object**, an LLM with **tool-calling**
whose primary tool *is* `search_hybrid`, streamed via SSE. Same grounded, cited entities as the card
UI — the assistant is orchestration, not a second search engine.

### 6.1 Model: tiered Claude via AI Gateway (`qg-search`)
- **Router / intent + filter extraction + tool-selection → Claude Haiku** (cheap; most turns stop here).
- **Synthesis / trip-planning / multi-step reasoning → Claude Sonnet** (only on router escalation).
- **Embeddings + rerank → Workers AI** (`bge-m3` + `bge-reranker`), unchanged.

Rationale: a safety-first product can't tolerate invented venues or shaky safety claims; Claude's
tool-calling + grounded-citation quality is materially better, and Claude is already in the stack
(Haiku for marketplace relevance + enrichment). AI Gateway adds caching (big saver on repeated
concierge prompts), rate-limit, fallback, unified observability. A Workers AI classifier can
front-run the router later as a cost optimization.

### 6.2 Capability → component map

| Capability | How it's built | Grounding |
|---|---|---|
| Conversational search | Haiku parses NL → `search_hybrid(filters, geo, dates)`; renders real cards | Cited cards, never invented |
| Trip-planning | Sonnet, multi-turn in DO; `search_hybrid` + `plan_trip`/`save_trip` on existing `trips`; surfaces `TripSafetyBriefing` | Itinerary items are real saved entities |
| Knowledge Q&A | `knowledge_search` → **CF AI Search** over crawled editorial + `news_articles` + city guides + `/help`/`/safety` | BM25+vector RAG with citations |
| Recommendations / concierge | `get_recommendations` = `personalized_semantic_search` + `trending` + bias + interest/home-city filters; proactive *and* in-chat | Ranked real cards, personalized |

### 6.3 Personalization, deepened (not just preserved)
- Inject the user profile (interests, vibes, home city, recently-visited, recent saves/clicks, bias
  summary) into the assistant system prompt **and** as default tool params → pre-personalized.
- Move the bias blend + interest boosts **into `search_hybrid`** (SQL-level personalization), now
  that signals + content share Postgres — not only post-hoc `personalizedRank()`.
- **Long-term memory:** the DO persists a rolling conversation summary + extracted preferences to a
  `user_memory` table; the concierge remembers across sessions.

### 6.4 Guardrails (mandatory)
- **Grounded-only:** a post-generation check rejects any venue/event not in the cited tool results.
- **Safety deference:** laws/safety/crisis answers must cite authoritative content (`/help`,
  `/safety`, safety-briefing data); never improvise risk; respect content warnings and high-risk tone.
- **Privacy:** personalization context stays server-side; DO memory is per-user and purgeable;
  honors incognito mode (§8.3).
- **Cost control:** AI Gateway caching + Haiku-first routing; Sonnet only on escalation.

### 6.5 Assistant phases (append to §5)
- **Phase 6 — Skeleton.** `assistant` Worker + DO, SSE, AI Gateway wiring, Haiku router with
  `search_hybrid` + `get_entity_details`. Ships **conversational search** first (reuses Phase 1–2).
- **Phase 7 — Knowledge RAG.** Stand up a CF AI Search instance over editorial/news/guides/safety
  (R2 or crawl); add `knowledge_search`.
- **Phase 8 — Concierge + memory.** `get_recommendations` RPC, proactive home-feed mode,
  `user_memory`, personalization injection.
- **Phase 9 — Trip planning.** Sonnet escalation; `plan_trip`/`save_trip`/`safety_briefing` wired to
  existing trip + safety features; multi-turn itinerary building.

---

## 7. Where Cloudflare products land

- **Workers AI** — embeddings (`bge-m3`) + rerank (`bge-reranker`). Already in use; kept.
- **AI Gateway (`qg-search`)** — caching/rate-limit/fallback/observability for embeddings + Claude.
- **Durable Objects** — per-conversation assistant memory + streaming.
- **Hyperdrive** — Worker → Supabase connection pooling + read caching.
- **AI Search (AutoRAG)** — the assistant's `knowledge_search` RAG tool over unstructured content
  (the one place its document/chunk model fits).
- **Vectorize** — *not* in the initial design; a later off-ramp for the vector leg only (§14).

---

## 8. Enhancements (folded into the plan)

Prioritized; the top three are the recommended first cut.

### 8.1 ★ Trust/liveness-aware ranking (bake into Phase 1)
Feed the existing **Event Truth Loop** (`trust_score`, `liveness_status`, `last_verified_at`) and
**Venue Truth Engine** (consensus confidence, `closed_at`, `last_refreshed_at`) into
`search_hybrid`'s `ORDER BY`: boost `live`/recently-verified, hard-demote
`dead_link`/`cancelled`/`closed`, sink stale records. Stops the classic travel-search failure of
surfacing a venue that shut last year. Highest impact-to-effort; makes the truth-loop investment
visible to users. **A few terms in the ranking expression.**

### 8.2 ★ Offline relevance eval harness in CI
Golden query set scored with nDCG/MRR, run in the nightly e2e workflow. Makes the Meili→PG cutover
**safe** and prevents silent ranking regressions forever after. De-risks everything else.

### 8.3 ★ Incognito / ephemeral search mode
For LGBTQ+ users in hostile regions, search history is a *safety risk*. A no-logging mode (no
`log_search`, no bias write, no DO memory), clear "what we remember" controls, per-query
personalization opt-out. Genuine differentiator aligned with the safety-first design lock.

### 8.4 Close the learning loop from engagement
Weekly offline job tunes RRF weights + boost factors per query-type from real click/save/book
signals (`search_audit_log`, tracked events) — lightweight learning-to-rank, no model training.

### 8.5 Zero-result recovery
On empty results: auto-relax the most restrictive filter, trigram spell-correct ("did you mean"),
and fall back to the assistant. Turns tracked `zero_hit` dead ends into conversions.

### 8.6 Accessibility & safety as first-class facets
Promote `accessibility_attributes`, `target_groups`, `sensitivity_flags`, `lgbti_relevance_score` to
top-level facets + natural assistant filters ("trans-friendly, wheelchair accessible"). Data already
exists.

### 8.7 Inline safety context in results
For higher-risk destinations, surface a compact safety signal on the card / an assistant preface
linking to `/safety` content — grounded, not improvised.

### 8.8 Semantic + answer caching
Extend the existing embed cache to popular-query result sets and assistant answers (TTL'd in KV,
keyed by normalized query + filters + lang).

### 8.9 Search analytics in admin
Dashboard from data already logged: zero-hit trends, p95 latency, click-through by query, facet
usage, top/failing queries. Slots next to the existing pipeline admin surfaces.

### 8.10 Instant answer card
A grounded assistant answer at the top of normal search results — best of card UI + chatbot without
forcing users into chat.

### 8.11 Saved searches & alerts
Save a query ("new fetish events in Berlin"); notify when the ingestion/news pipelines produce a
match. Natural fit with existing pipeline + notification infra; high retention.

### 8.12 Personalized weekly digest
Reuse `get_recommendations` for a concierge "what's on near you / matches your saves" email/push.

---

## 9. Search UX intelligence (instant recommendations, intelligent filters & options)

The UX-intelligence layer sits **on top** of the engine above and reuses pieces already in the
plan — `/autocomplete`, `search_facets`, the Haiku router (§6), `get_recommendations` (§8.x), and the
`_boostReason` the Worker already computes. Almost no new backend; mostly frontend + three reuses.

### 9.1 Zero-query state — recommend before a keystroke
The empty, focused search box is the highest-value overlooked moment. Render a personalized/contextual
panel from `get_recommendations` instead of blank:
- **Personalized:** "Because you saved Berghain", "Matches your interests".
- **Page-contextual:** on a city page → top venues/events there; on an event → similar/nearby.
- **Time + place contextual:** "This weekend near you", "Open now nearby" (geo + `hours` jsonb + event dates).
- **Trending chips:** top queries from `top_queries` analytics + trending entities.
- **Recent searches** (local-only; suppressed in incognito mode §8.3).

### 9.2 As-you-type intelligence (instant search)
The `/autocomplete` path (trigram-prefix RPC, KV-cached popular prefixes, <40ms) gets smarter:
- **Federated grouped preview:** results bucketed by type (Venues / Events / Cities / People) in one
  dropdown, prefix-highlighted; Enter jumps straight to the entity.
- **Query autosuggest:** complete the *query*, not just match entities — from popular queries + entity
  names + tag taxonomy ("ber…" → "Berlin", "Berlin pride 2026", "bears in Berlin").
- **"Did you mean"** inline via trigram, with one-tap "search original instead".

### 9.3 ★ Intelligent filters
- **Natural-language → structured filters.** "wheelchair-accessible trans-friendly bars in Berlin open
  late" auto-applies `category=bar`, `accessibility=wheelchair`, `target_groups=trans`, `city=Berlin`,
  `open_now=true`. Reuses the **Haiku router** (§6) as a cheap, cached "parse query → filter JSON" call
  — the same brain exposed to the classic search box. Extracted filters render as **visible, editable
  chips** the user can toggle off → explainable, not magic.
- **Dynamic / contextual facets:** show only facets relevant to the intent + result set (events → date
  + event_type; venues → category + accessibility), hide empty ones, order by user interest (already
  reordering `facetDistribution`). One source: `search_facets`.
- **Range filters with histograms:** return price/date *distributions* (`width_bucket` in
  `search_facets`) so users drag a slider over the real shape of the data.
- **Smart filter prompts:** "Free only? · This weekend? · Open now?" suggested from query + result
  distribution — one-tap refinements.
- **Personalized defaults / presets:** apply a user's "prefer accessible" by default; let power users
  save filter presets ("queer nightlife near me").

### 9.4 Intelligent search options
- **Intent-aware sort:** surface the fitting sort — distance when geo present, date for events, rating
  for venues — instead of a static list.
- **Synonym/expansion transparency:** "also searching: gay bar · LGBTQ venue" (already expanded via
  `pgSynonyms`/LLM — just show it, with a toggle).
- **Result explanations ("why this?"):** expose the existing `_boostReason` as a subtle card tag;
  pairs with trust-aware ranking (§8.1) → "Verified this week".
- **Cross-lingual:** detect query language, search cross-lingual via `bge-m3`, offer "show results in
  English too".

### 9.5 Build mapping & sequencing
Low new infra — frontend + three reuses:
1. **Haiku router** (§6, Phase 6) doubles as the NL→filter parser for the plain search box — the
   assistant work pays off twice.
2. **`search_facets`** extended with numeric histograms + always-on distributions → dynamic facets +
   range sliders.
3. **`get_recommendations`** (Phase 8) → the zero-query panel.

Sequencing: as-you-type + did-you-mean + result explanations are **quick wins alongside Phase 2**;
NL→filters and zero-query recommendations land **with Phases 6/8** (shared router + recommendations
RPC). **Top two to do first:** NL→filters with editable chips, and the zero-query personalized panel.

---

## 10. Content lifecycle — creation, linking & deduplication

The **same embedding substrate** built for search (`content_embeddings` / the `search_documents`
table) is also the engine for content creation, related-content linking, and dedup — one asset, many
uses. This does **not** reinvent the existing dedup machinery (ingestion `pipeline-deduplicate`, news
fingerprints + `news_dedup_audit`, marketplace's 5-tier dedup, the Venue Truth Engine consensus-merge
with `venue_field_provenance`, `duplicate_of_id`, `entity_cluster_membership`). It **unifies** that
logic and extends it to creation-time and cross-type.

### 10.1 Content creation (AI-assisted, grounded, human-gated)
- **Grounded editorial drafting:** Sonnet (via AI Gateway) drafts city guides, "best of" roundups,
  venue/event descriptions — grounded in real entities via `search_hybrid`/RAG with citations, never
  invented. Drafts flow through the *existing* `review-gate → commit` pipeline, not straight to publish.
- **Field enrichment, generalized:** extend the existing `pipeline-enrich-news` / `event-agentic-enrich`
  pattern to venues/personalities — auto-fill missing `description`, `tags`, `target_groups`,
  `accessibility`, summaries, with confidence + provenance (reuse Truth-Engine `field_provenance`).
- **Programmatic SEO collections:** auto-generate + keep-fresh landing pages from `search_hybrid`
  queries ("Trans-friendly venues in Berlin"), regenerated as data changes. Multilingual (11 langs)
  via the same pipeline.
- **Content-gap radar (generalized):** extend `event_coverage_radar` to an embedding-based detector —
  find under-covered cities/topics in the vector space and queue creation tasks.

### 10.2 Linking of related content (the knowledge graph)
- **Semantic "related" links:** reuse pgvector cosine (the `/similar` path) for related
  venues/events/news/personalities/cities and "more in this topic" (via `cluster_ids`).
- **Cross-type entity linking:** LLM NER over news/editorial → resolve mentions to canonical entity
  IDs (using alias/synonym tables for disambiguation). Powers internal-linking-for-SEO and the
  `react-force-graph-2d` view.
- **A typed `entity_relationships` table:** edges (`mentions`, `located_in`, `hosted_at`,
  `related_to`, `same_topic`) each with source + confidence + provenance, populated by embeddings +
  LLM + existing FKs (`city_id`, `country_id`, `venue_id`). Single backbone for related-content
  modules, the force-graph, and assistant traversal.

### 10.3 Preventing duplication (at creation time, not just ingestion)
- **Unified `find_duplicates(content_type, text|embedding)` RPC** — embedding similarity + trigram +
  fingerprint in one place — shared by ingestion, Chrome-extension submissions, *and* AI creation,
  replacing scattered per-pipeline dedup branches. Single source of truth for "is this a dup?".
- **Submission-time guard:** when a user or the AI drafter starts creating, surface likely matches
  live — "This looks like *Berghain* you already have. Update instead?" Stops dupes before they're written.
- **Semantic fingerprint as a second gate:** your fingerprints are exact (SHA-256 of normalized
  title/day/source); add an embedding near-dup threshold to catch reworded/cross-source dupes that
  exact fingerprints miss.

### 10.4 Deduplication (merging what slipped through)
- **Periodic semantic dedup sweep:** cluster `content_embeddings` by cosine threshold to surface
  cross-source near-dupes, queued for merge review — the Venue Truth Engine consensus-merge pattern
  generalized to all entity types (field-level voting + provenance, auto-merge on agreement, review on
  HIGH-RISK conflicts).
- **Merge tooling + SEO safety:** field-level side-by-side merge (reuse `venue_field_provenance`),
  pick winning fields, set `duplicate_of_id`, redirect old slug → canonical (301 via a `slug_redirects`
  table), and repoint references (`events.venue_id`, `entity_relationships`).

### 10.5 How it rides the plan
Not a new system — the same three assets reused:
1. **Embeddings** (`content_embeddings` / `search_documents`) → related-links, gap detection, near-dup.
2. **Assistant LLM** (Haiku/Sonnet via AI Gateway) → drafting, entity linking, dedup adjudication.
3. **Review-gate + Truth-Engine provenance** → human-in-the-loop on generated content *and* merges.

**Top two first:** the unified `find_duplicates` RPC (consolidates dedup, protects submissions + AI
creation), and the `entity_relationships` graph from semantic + LLM linking (foundation for
related-content, internal linking, and assistant traversal). Both layer **after** Phase 1 (they need
the embedding/search core) and reuse the assistant from Phase 6.

---

## 11. External travel data & affiliate integration (Travelpayouts)

External providers (Travelpayouts: Aviasales flights, Hotellook hotels, destination/airport data) fit
as **two complementary patterns**, reusing the assistant's tool-calling and your existing affiliate +
ingestion stack (`affiliate_partners`, `marketplace_merchants`, `source-*` pipeline). The trick is
routing each data kind to the right pattern by volatility.

### 11.1 Pattern A — live tool call (volatile data)
Flight prices, availability, and live hotel rates change by the minute and usually can't be cached
long under affiliate ToS — so they are **not** indexed in `search_hybrid`. They become **tools the
assistant calls at query time**: `flight_offers(origin, dest, dates)`, `hotel_offers(city, dates)`.
A natural extension of §6 / trip-planning (Phase 9): "flight to Berlin for Pride weekend + a
queer-friendly hotel near the gayborhood" → the LLM calls `search_hybrid` (curated, grounded
venues/events) **and** Travelpayouts (live flights/hotels) and composes one answer.

### 11.2 Pattern B — ingest as a source (stable reference data + monetization)
Airports, destination metadata, and static hotel records are stable and cacheable — pull them through
the **existing `source-* → normalize → dedupe → commit` pipeline** (like `source-awin`/`source-shopify`
in the marketplace DAG), store in Postgres, embed, and index so external hotels become first-class,
rankable, geo-linked entities ("hotels near this queer village"). Monetize via `affiliate_partners` +
the `marketplace_merchants` registry pattern (provider, `api_key_env`, last-sync). Travelpayouts *is*
an affiliate network — squarely in the existing revenue model.

### 11.3 Routing into intelligent search
The §9.3 NL→intent router is the dispatcher: on **travel intent** ("flights to…", "hotels in…",
dates), route to the external tool and render a **clearly-labeled, separate "Travel / Book" module** —
never blended into organic curated ranking (paid third-party inventory must not pollute vetted,
safety-first data). Personalization rides along: home city, saved trips, and bias pre-fill
origin/destination/dates; the concierge can be proactive ("Flights to your saved Pride event are €120
this week").

### 11.4 Architecture on the stack
- **Adapter Worker/edge function** holds the Travelpayouts marker/token (like `search-proxy` holds the
  Meili key), normalizes responses, exposes the tools.
- **Short-TTL caching** via Workers Cache API + KV (respecting Travelpayouts caching limits — longer
  for static hotel/airport data, very short/none for live prices) + per-IP rate-limiting.
- **Circuit breaker + fail-soft** (existing pipeline pattern): if the API is slow/down, the offer
  module simply doesn't render; core search/assistant never breaks.
- **Network policy:** the environment's outbound policy must allow `api.travelpayouts.com`.
- **Generic provider interface:** model like `marketplace_merchants` so Booking/Expedia/GetYourGuide
  drop in later behind the same adapter contract.

### 11.5 Guardrails
- **ToS & caching limits** on live prices — live-fetch what can't be stored.
- **Affiliate disclosure** (FTC/EU) — label the module "Booking option (affiliate)".
- **Not curated:** external hotels aren't vetted to your LGBTQ+ standards — pair offers with the **Trip
  Safety Briefing** so a trip to a high-risk destination is never sold without safety context.
  Differentiator vs a generic OTA.
- **Latency/cost:** call the live API only on explicit travel intent, never per keystroke.

Sequencing: Pattern B (ingestion source) can land anytime after Phase 1; Pattern A (live assistant
tool) layers onto Phase 9 trip planning.

---

## 12. Platform-wide considerations (safety, privacy, AI governance, resilience)

Beyond search, these are **harm-weighted** concerns for a safety-critical product serving a globally
vulnerable audience — where failure can out a person, give stale life-or-death safety info, or be
blocked/inaccessible when most needed. The search/assistant work above must respect these; several are
platform-wide workstreams that run **parallel** to the migration, not inside it.

### 12.1 ★ User safety & privacy — hostile-jurisdiction threat model
- **Treat user data as toxic.** Saved venues, location, and browse/search history are *outing vectors*.
  Data minimization; full **anonymous / no-account use**; ephemeral data; **client-side encryption** of
  sensitive saves so a breach or subpoena can't out anyone. Extends incognito (§8.3) platform-wide.
- **Stealth & escape:** quick-exit / panic button, optional disguised mode, no revealing notifications.
- **No ad-tech / third-party leakage:** privacy-preserving analytics only — every embedded script is a
  data-exfil risk for this audience.
- **Censorship resistance:** VPN-friendly, avoid blockable CDNs, mirror/alt-domain strategy,
  account-less access (the site *will* be blocked in some countries).
- **Account lifecycle:** real GDPR export/delete, 2FA, session hygiene.

### 12.2 ★ AI governance & prompt injection
- Scraped/external content **already** flows into LLM pipelines (`pipeline-enrich-news`, marketplace
  relevance, agentic event enrich) and will feed the assistant → an untrusted **prompt-injection
  surface**. Sanitize/isolate scraped text, validate outputs, label AI-generated content.
- **Hallucination in safety/legal contexts is life-critical**, and LLMs carry bias on queer/regional
  topics. Hard rule: safety/legal claims are **never LLM-improvised** — human-reviewed sources only
  (extends the §6.4 grounding guardrails to the whole AI surface).

### 12.3 ★ Offline & resilience abroad
- A **PWA with offline access** to saved venues, safety briefings, and maps so critical info survives
  no-signal, roaming, or a censored network — exactly when it's needed most. Pair with Core Web Vitals
  / bundle / image discipline (manual chunks already in place).

### 12.4 Content trust beyond events/venues
- Extend Truth-Engine freshness/provenance rigor to **safety & legal status** (criminalization laws
  change; an outdated "safe here" is dangerous). Moderate UGC reviews/submissions as the Chrome
  extension scales — defamation, fake listings, harassment, spam.

### 12.5 Accessibility as a legal + ethical baseline
- The **European Accessibility Act** (in force 2025) makes WCAG conformance a legal requirement for
  many EU services. Standing audit cadence (screen reader, keyboard, cognitive load, reduced motion)
  building on the existing monochrome/a11y/motion locks.

### 12.6 Localization depth (beyond UI strings)
- The high-value, safety-relevant localization is **content + regional legal/safety data**,
  **culturally-correct queer terminology** (varies by language/region), **RTL**, and currency/date.
  Wrong terminology or stale regional status is a safety issue, not polish.

### 12.7 Pipeline fragility, LLM cost & sustainability
- **Source diversity + graceful degradation** (you already hit scraper CF 403s); **LLM cost
  caps/budgets + monitoring** (extend existing circuit breakers); data-freshness/coverage dashboards;
  and a **revenue model that doesn't compromise privacy** (affiliate disclosure, donations/grants/
  premium over data monetization).

### 12.8 Security posture & DR
- A breach here is catastrophic, so security must be **continuously verified**: RLS audits (Supabase
  advisors), secrets hygiene, periodic pen-testing, an incident-response plan, and tested backups/DR.

### 12.9 Priorities
Top three platform-wide: (1) the **hostile-jurisdiction privacy/safety threat model + "data as toxic"
posture**; (2) **AI-safety / prompt-injection controls** (untrusted content already feeds the LLMs);
(3) **offline/mobile resilience**. Parallel workstreams to the search migration, not blockers.

---

## 13. Map & geo integration

Geo is unusually central — a travel product where location is both the core value and the **most
sensitive datum** for the audience. Capability and safety/privacy must be designed together. Grounded
in the stack (MapLibre GL, PostGIS from §3.1, lat/lng on venues/events/hotels/festivals/queer_villages,
`queer_villages` polygons, R2, Workers).

### 13.1 Geo data backbone — PostGIS as source of truth
- Migrate bare `numeric` lat/lng to `geography(Point,4326)` + **GiST spatial indexes** → radius,
  bounding-box, KNN distance sort, and **point-in-polygon**.
- **Auto-link by containment:** `ST_Contains` against `queer_villages`/`cities` polygons makes the
  `geo_linked_at` entity→`city_id`/`country_id`/`queer_village_id` linking exact and automatic.
- **Proximity as a dedup signal:** same-coordinate listings are almost certainly the same place — feed
  `ST_DWithin` into the unified `find_duplicates` RPC (§10.3) as a strong dedup vote.

### 13.2 ★ Self-hosted, privacy-first tiles — PMTiles on R2 + Worker
Today MapLibre likely pulls tiles from a provider (the Mapbox token in env) → **every map pan leaks the
user's location + interests to a third party**, unacceptable for this audience. Instead host **PMTiles**
(single-file vector tiles) on **R2**, served via a Worker (HTTP range requests); MapLibre reads them
directly. Yields: no third-party location leakage (§12.1), a **custom monochrome style** (map vector
tiles are an allowlisted color exception), **offline-cacheable** tiles (§12.3), low cost, one fewer
external dependency, and full Cloudflare-native fit. Drop the Mapbox token.

### 13.3 Geocoding pipeline (privacy-respecting)
Address→coords at ingestion, coords→place for "near me" — run **proxied + cached through a Worker**
(never the client calling a provider directly), store a **confidence score**, prefer privacy-respecting
providers (self-hosted Nominatim an option). Low-confidence geocodes flag for review (Truth-Engine
provenance).

### 13.4 Map ↔ search integration (UX)
Where §9 meets the map:
- **Split list+map** with sync: searching filters the map; **"Search this area"** runs a bounding-box
  `search_hybrid`; clicking a marker opens the card.
- **Marker clustering** (supercluster) + **viewport-bounded queries** so all points never load at once.
- **Intent-aware:** "near me / open now" uses geolocation + the `hours` jsonb; distance is the default
  sort when geo is present (§9.4).

### 13.5 ★ Safety geo — the differentiator
Risk is neighborhood-level, not country-uniform. Overlay **safety context on the map** grounded in
safety-briefing data: highlight safer areas/routes, flag higher-risk zones, plan around them. Plus a
country-level **choropleth of legal/safety status** (reuse the existing "equality scores" functional
color scale) for the world-map view. The map becomes a safety instrument, not just a finder — no
generic OTA does this.

### 13.6 Geo privacy & safety (per §12.1)
- **User location is the most sensitive datum:** client-side geolocation only, **coarse + ephemeral +
  opt-in**, never stored precisely.
- **Venue-side:** let sensitive venues be **fuzzed/hidden** on public maps in hostile regions — don't
  pinpoint a queer space for someone hunting it.
- Strip location from shared map screenshots/links.

### 13.7 Trip planning & routing
For the Phase 9 concierge: **walking/transit routing** between itinerary stops and **isochrones**
("venues within a 15-min walk of my hotel") via OSRM or a routing provider — keeps assistant plans
geographically coherent.

### 13.8 Priorities
Top three: (1) **PMTiles-on-R2 self-hosted tiles** (kills the biggest location-privacy leak, pure
Cloudflare-native); (2) **PostGIS as the geo backbone** (containment auto-linking + proximity dedup,
beyond search radius); (3) **safety-geo overlays** (the map as a safety instrument).

---

## 14. Vectorize off-ramp (deferred)

If DB read-load isolation or edge-local vector latency becomes the bottleneck, mirror
`content_embeddings` into **Vectorize** and have the Worker query it for the **vector leg only**,
keeping FTS + facets + geo + trust ranking in Postgres. The `search_hybrid` interface stays; one leg
moves. Scaling lever, not part of the initial migration.

---

## 15. Open decisions

1. **Searchable layer** — per-entity tsvector + `UNION ALL` (Option A) vs single `search_documents`
   table (Option B). *Lean B* (uniform ranking, simpler RPC, trivial facets).
2. **RRF location** — fuse in SQL (fewer round trips) vs keep in Worker (matches today exactly,
   easier A/B). *Lean SQL.*
3. **Geo extension** — PostGIS (full geo) vs `earthdistance`/cube (lighter). *Lean PostGIS.*
4. **First cutover scope** — all 11 types at once vs pilot `venues`+`events` behind the flag, then
   expand. *Lean pilot first.*

---

## 16. Risks & mitigations

- **Search load on the OLTP primary** (the one real downside): Hyperdrive query caching first; add a
  Supabase **read replica** if QPS climbs; Vectorize off-ramp (§14) as the last lever.
- **Relevance regression:** the shadow-mode diff (Phase 3) against a frozen baseline is the gate —
  no cutover until PG matches. The eval harness (§8.2) keeps it from drifting after.
- **Generated-column write cost:** STORED tsvector adds a little per write; negligible at this
  volume and far cheaper than the current trigger→pg_net→edge-function→Meili round trip.
- **Migration count conflicts:** check the current count before adding (CLAUDE.md gotcha); no
  `CONCURRENTLY` inside the transaction.
- **Assistant hallucination / unsafe answers:** §6.4 guardrails — grounded-only check, safety
  deference, citations.
- **LLM cost/latency:** tiered Haiku→Sonnet routing + AI Gateway caching + streaming.

---

## 17. Sequencing summary

```
Phase 0  Baseline + flag
Phase 1  Postgres core (search_hybrid + facets + TRUST-AWARE ranking) + eval harness (8.2)
Phase 2  Worker rewrite (pgSearch + Hyperdrive)  + UX quick wins (§9.2 as-you-type, did-you-mean, §9.4 explanations)
Phase 3  Shadow mode + relevance validation
Phase 4  Cutover (flag flip, instant rollback)
Phase 5  Decommission Meili
─────────  structured search done; assistant builds on top ─────────
Phase 6  Assistant skeleton (conversational search)  + NL→filters with editable chips (§9.3)
Phase 7  Knowledge RAG (CF AI Search)
Phase 8  Concierge + memory + deepened personalization  + zero-query recommendations panel (§9.1)
Phase 9  Trip planning
Enhancements 8.x folded across phases; incognito (8.3) with Phase 2, analytics (8.9) with Phase 4+;
UX intelligence (§9) layered per the mapping in §9.5.
```
