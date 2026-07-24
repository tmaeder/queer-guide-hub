# Taxonomy Ontology Engine — design

**Date:** 2026-07-24
**Status:** approved design, pre-implementation
**Goal:** drastically improve management *and* quality of taxonomies across Queer Guide by turning the flat tag table into a self-maintaining SKOS-lite concept graph (one unified, faceted vocabulary).

## Why now — the substrate already exists, unconnected

Current `unified_tags` state (2026-07-24):

| Metric | Value |
|---|---|
| total tags | 8,998 |
| active | 4,421 |
| **zero-usage (dead)** | **6,163 (68%)** |
| uncategorized | 1,424 |
| human-reviewed | 1,190 |
| avg quality_score | 56.7 |
| distinct categories | 75 (`tag_categories`: 55 rows) |

But the ontology raw materials are *already present and unused as structure*:

- **8,998 tags already embedded** in `content_embeddings` (`content_type='tag'`, vector(1024)) → semantic dedup / nearest-neighbor is ready today, **zero backfill**.
- **4,627 tags have `wikidata_id`** (51%) → Wikidata's own graph (P279 subclass-of, P361 part-of) can auto-seed half the hierarchy and serves as `skos:exactMatch`.
- **8,364 have `name_i18n`** → multilingual labels already exist.
- **`tag_categories`** (55) + `category_id` on 4,981 → a flat proto-hierarchy to migrate.
- **`merged_into_id`** on 66 → crude synonym collapse already in place.

Missing = *structure* (concept/label split, poly-hierarchy, relations, facet scopes) and the *engine* that grows + maintains it. This design supplies both, reusing the proven Truth-Engine pattern (City/Venue/Event/Amenity/Country).

## Decisions taken during brainstorming

- **Direction:** B-heavy — the semantic concept graph is the centerpiece; self-maintaining quality + cockpit layer on top.
- **Silos:** **fold in as facets** — amenities / professions / target_groups / news / marketplace migrate into `unified_tags` as facet-scoped concepts. One vocabulary, one engine, one cockpit.
- **Auto-apply:** **conservative** — only near-certain structural edges auto-apply (embedding dup > 0.97, Wikidata P279); everything else review-gated.

## 1. Data model — SKOS-lite concept graph

> **Substrate correction (post-brainstorming DB audit, 2026-07-24):** most of this model *already exists as abandoned, half-wired scaffolding*. The work is consolidation + governance + population, **not** creating new tables. Reconciled mapping:
> | Design concept | Existing table | State |
> |---|---|---|
> | labels/synonyms | **`tag_aliases`** `(canonical_tag_id, alias_name, alias_slug, alias_type, review_status)` | 15,187 rows, ungoverned |
> | curated graph | **`tag_relations`** `(source_tag_id, target_tag_id, relation_type, confidence, review_status)` | **6 rows — effectively empty** |
> | raw similarity pool | **`tag_relationships`** `(tag1_id, tag2_id, similarity_score, relationship_type)` | 70,426 rows — never promoted into the curated graph |
> | usage junction | **`unified_tag_assignments`** `(tag_id, entity_id, entity_type)` | 150,989 rows; `entity_type` vocab dirty (`venues`/`venue`, `news`/`news_article`, `marketplace_listing`/`marketplace`) |
> | per-domain facet counts | **`tag_usage_summary`** (view) | 1 row/tag → facets derivable |
> | audit | **`tag_change_log`** | 110,879 rows |
> | embeddings | **`tag_embeddings`** `(tag_id, embedding, model)` | 7,393 / 8,998 |
> | poly-category | **`tag_category_assignments`** + `tag_categories` | 6,257 rows |
> | lifecycle | `unified_tags.status` (`active` 4,421 / `deprecated` 4,516 / `merged` 61) | prune partly done; **1,586 active tags still zero-usage** |
>
> So `tag_facets` is a **derived view**, not a base table; "labels" = govern existing `tag_aliases`; `tag_relations` is the empty canonical graph to *populate* from the 70k `tag_relationships` pool.

Conceptual target (over the existing tables above):

- **Labels** — `tag_aliases` (alt/synonym) + `unified_tags.name_i18n` (per-language pref). Many surface strings → one concept ("gay bar" / "schwulenbar" / "gaybar").
- **`tag_relations`** — the curated edge graph. Predicates: `broader` (child→parent) + derived `narrower`, `related`, `exact_match`. Poly-hierarchical DAG, cycle-guarded. Populated by P1/P2 proposers from the `tag_relationships` candidate pool.
- **`tag_facets`** (view) — `(concept_id, facet)` derived from `unified_tag_assignments` with `entity_type` normalized to a canonical facet vocab. **The unification** — silos become facet scopes on shared concepts.
- **External anchor** — existing `wikidata_id` = `skos:exactMatch`.

Silo folding (amenities 87, professions 35, target_groups, …): migrate each silo term to a concept with the matching facet; dedupe against existing concepts via embedding-NN during migration; leave a compatibility view per old table so existing readers keep working until cut over.

## 2. The engine — proposers → review queue

Structure never mutates silently. Every proposer writes a **signal** into `tag_quality_signals`; a nightly pure-SQL recompute adjudicates.

| Proposer | Mechanism | Output |
|---|---|---|
| **Semantic dedup** | pure-SQL cosine-NN within facet over existing tag embeddings → near-dup clusters | merge / synonym proposals — the sprawl killer |
| **Wikidata hierarchy** | circuit-broken edge fn: pull P279/P361 chains for anchored concepts | `broader` edges, shared-ancestor alignment |
| **Co-occurrence** | pure-SQL: tags co-tagging the same entities above a lift threshold | `related` edges |
| **Facet inferer** | pure-SQL: entity_kinds a concept actually tags | `tag_facets` rows |
| **LLM adjudicator** | circuit-broken, daily-capped; only ambiguous merges/labels cheap signals can't settle, grounded | tie-break, never bulk |

**`run_tag_ontology_recompute`** (nightly, pure-SQL) consumes the ledger and gates by confidence:

- **auto-apply (conservative):** embedding cosine > 0.97 exact-dup merges; Wikidata P279 `broader` edges. Every such write is reversible (`status`, audit row).
- **review-gated:** all other merges, hierarchy conflicts, ambiguous labels, cross-facet collapses → `tag_review_queue`.

Support tables mirror the other engines: `tag_field_provenance` (per-field winning source), `tag_ontology_audit` (every merge/edge decision), `tag_coverage_gaps` (orphan concepts with no `broader`, thin facets, high-usage unaligned concepts), `tags_due_for_review(limit)` selector (empty/never-reviewed/broken-first).

**DB-safety (load-bearing):** the DB is disk-constrained and `unified_tags` fires a search-sync trigger. Recompute stays pure-SQL, batched, and must **not** mass-UPDATE `unified_tags`; follow the column-scoped-trigger pattern already used by `tag_quality`. Structural data lives in the new side tables, not in wide updates to the concept row.

## 3. Governance gate (front door)

- **Creation gate:** a new tag runs embedding-NN dedup + min-quality before it exists. Near-dup → auto-attach as an `alt` label on the existing concept; borderline → review queue; only genuinely distinct → net-new concept.
- **Lifecycle state machine:** `proposed → active → deprecated → merged`, all reversible.
- **Step 0 prune:** the 6,163 zero-usage + 1,424 uncategorized run through this same machinery (reversible deprecate / merge), collapsing 9k toward an estimated ~2–3k canonical concepts before the engine ever runs on live vocab.

## 4. Cockpit — `/admin/taxonomy`

Graph-first admin surface, reusing existing review-queue + provenance components:

- dedup-cluster review (accept / merge / split)
- hierarchy editor (drag `broader`/`narrower`, cycle-guarded)
- review queue (concept merges, ambiguous labels, coverage gaps)
- coverage gaps + per-facet analytics
- concept detail: labels × languages, relations, provenance, usage, Wikidata link, lifecycle state

## 5. Public payoff (the point, not just hygiene)

- **Search query-expansion:** `narrower` concepts roll up — "queer venue" returns gay bar, lesbian bar, drag venue. Hooks existing `tags_in_search`.
- **Glossary → browsable ontology:** hierarchy breadcrumbs + related concepts on existing `tag_glossary_pages`.
- **Cross-silo faceted browse:** shared concepts unify venue/event/marketplace/news discovery.
- **Multilingual discovery** via `tag_labels`.

## 6. Phasing

- **P0 — prune + schema:** create `tag_labels` / `tag_relations` / `tag_facets` + engine side-tables; migrate `merged_into_id` + `name_i18n` → labels; backfill `tag_facets` from current usage; reversible-prune the dead 6,163.
- **P1 — dedup + cockpit:** semantic-dedup proposer + `/admin/taxonomy` cluster review → collapse 9k → ~2–3k canonical concepts.
- **P2 — build the graph:** Wikidata hierarchy + co-occurrence proposers → `broader`/`narrower`/`related` edges.
- **P3 — self-maintain:** nightly recompute cron + coverage radar + creation gate + `tags_due_for_review`; register in `admin_automations` + pg_cron.
- **P4 — public payoff:** search expansion + glossary ontology + faceted browse.
- **P5 (after P1–P3 prove out):** complete silo cut-over (drop compatibility views once readers migrated).

## Risks / YAGNI guardrails

- **SKOS-lite only** — `broader`/`narrower`/`related`/`exact_match`. No OWL, no reasoner. Stop there.
- **All structural auto-apply reversible** — every edge/merge carries `status` + an audit row; conservative thresholds.
- **Disk + trigger-storm** — pure-SQL, batched recompute; no wide `unified_tags` writes; column-scoped triggers.
- **Dedup threshold** starts strict (>0.97 auto, review below), loosened with feedback.
- **Silo folding is incremental** — compatibility views keep old readers alive; cut over only after the graph proves out (P5).

## Existing pieces to reuse / not reinvent

- Truth-Engine machinery: signals ledger, `*_field_provenance`, `*_consensus_audit`, coverage radar, `*_due_for_*` selectors, confidence-gated `*_review_queue` + `approve_/reject_` RPCs, circuit-broken enrich edge fns, `admin_automations` + pg_cron registration.
- `tag_quality_system` (scorecard + SEO gate + column-scoped search trigger) — the quality-score layer already exists; extend, don't replace.
- `content_embeddings` (`content_type='tag'`) — already populated; the dedup/NN substrate.
- `tags_in_search`, `tag_glossary_pages`, `tag_discovery_axis` — the public consumers to wire the graph into.
