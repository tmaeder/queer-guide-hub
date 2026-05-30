# Personality Data Flywheel — Design

**Date:** 2026-05-30
**Status:** Approved (brainstorm) → ready for planning
**Goal:** Drastically and *continuously* improve & enrich personality data through automation, building a unique LGBTQ+ data moat.

## Problem — real DB state (12,619 personalities)

| Field | Filled | Note |
|---|---|---|
| `lgbti_details` (the *why*) | **0%** | the moat, totally empty |
| `verification_status='verified'` | **0%** | no trust signal |
| `wikidata_qid` | 16% | unlinked from canonical source |
| `birth_date` | 12% | |
| `description` >80 chars | 1% | (bio at 61%, descriptions thin) |
| `city_id` | 11% | graph unlinked |
| tag assignments | ~0% | auto-tagger never run |
| `image_url` | 65% | |
| `nationality` / `country_id` | 46% / 45% | |
| `last_refreshed_at` set | 44% | no continuous refresh discipline |
| avg `quality_score` | 55.3 | |

The four optimization goals (LGBTQ+ significance, graph cross-linking, completeness+freshness, net-new discovery) are all in scope → one integrated flywheel, not four bolt-ons.

## Architecture — a self-prioritizing flywheel

Reuses existing machinery: pgmq + `workflow-dispatcher` + `workflow_definitions`, `pipeline-*` DAG nodes, dedup RPCs (`find_personality_duplicate_candidates`), review-gate, and never-clobber-curated commit logic (`commit_personality_staging_item`).

### 0. The brain — data-debt scheduler (makes it *continuous*)
- New view `personality_data_health`: per-record **debt vector** (missing fields) + **staleness** (TTL by `is_living` / recently-deceased / `view_count`).
- Nightly cron ranks **worst-first × highest-traffic-first**, enqueues only what each record needs. Complete records are skipped; budget goes where it moves the needle.

### 1. Loop A — Multi-source factual enrichment (breadth + freshness) — *cheap, deterministic*
- Sources beyond Wikidata: **Wikipedia REST** (bio extract), **Wikidata** (birth/death/QID), **Wikimedia Commons** (images), **MusicBrainz/IMDb/VIAF** via existing `external_ids`.
- **Corroborate across sources → confidence score.** Fills bio, image, birth/death, nationality, social_links, external_ids.
- **Refresh TTL loop:** living every 90d, recently-deceased weekly, rest yearly. Catches deaths, new works, broken images. Generalizes the existing image-reimport sweep.

### 2. Loop B — LGBTQ+ significance layer (the moat) — *LLM, gated*
Fills the 0% `lgbti_details` + `lgbti_relevance_score`.
- Agent reads the assembled multi-source dossier + queer-specific sources (Wikipedia LGBT categories, queer archives, the project's own news pipeline mentions).
- Produces a **sourced, cited narrative** — RAG over fetched text; **every claim must cite a `personality_sources` row.** No ungrounded generation.
- Haiku for classification (`lgbti_connection`); escalate to a larger model only for narratives on high-value/high-traffic records. Cached dossiers.

### 3. Loop C — Graph cross-linking — *cheap*
- **Geo-link** birth_place/death_place/nationality → cities/countries (reuse news pipeline geo enrichment). Closes the 89% city gap.
- **Auto-tag** via `unified_tags` → instant SEO + discovery surface.
- **Entity links:** personalities ↔ venues / events / villages / each other ("performed at", "founded", "associated with"). Feeds `react-force-graph`.

### 4. Loop D — Net-new discovery (coverage grows itself) — *cheap watcher*
- Weekly **Wikidata SPARQL** for new LGBTQ+ humans not in DB.
- Mine the **hourly news pipeline** for named LGBTQ+ people → stage candidates.
- Mine **event lineups**. All flow through existing dedup → review-gate.

### Trust & provenance (cross-cutting)
- **Confidence-gated auto-commit** (reuse review-gate): multi-source agreement auto-commits; LLM narratives + low-confidence → human queue in `AdminPersonalities`.
- **Auto-`verified`** when N independent sources corroborate.
- Every field change writes a `personality_sources` row = full audit. Curated fields never clobbered (already enforced).

### Cost control
- Loops A/C/D are HTTP+SQL, near-free. Only Loop B costs tokens; gated by relevance threshold + traffic + caching. Priority queue spends worst/most-viewed first.

## Phasing
1. **Backbone + Loop A** — scoring view, scheduler cron, multi-source enrich + refresh TTL. (breadth lift)
2. **Loop C** — geo + tags + cross-links. (unlocks graph/SEO)
3. **Loop B** — significance layer. (the moat)
4. **Loop D** — discovery. (compounding growth)

## Reused components
- Orchestration: pgmq, `workflow-dispatcher`, `workflow_definitions`, `pipeline-executor`
- Pipeline nodes: `pipeline-normalize/validate/enrich-personality/quality-score/review-gate/commit`
- Dedup: `find_personality_duplicate_candidates`, `_shared/dedup-engine.ts`
- Commit: `commit_personality_staging_item` (merge, never clobber curated)
- Provenance: `personality_sources`, `personality_internal_notes`
- Admin review surface: `src/pages/AdminPersonalities.tsx`
