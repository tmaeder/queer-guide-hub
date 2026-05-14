# Phase 0 — Unified Model

A single contract that connects tags, topics, synonyms, entities, geo, images, dates, and search. Everything below is enforceable at ingest and observable at admin.

## Naming conventions

- **Entity types** (closed enum, used everywhere): `venue, event, news_article, marketplace_listing, personality, queer_village, city, country, hotel, group, tag`.
- **Locales**: BCP-47 codes (`en, de, es, fr, ...`). The search-intelligence layer accepts `*` for "applies to all locales".
- **Slugs**: lowercased, kebab-case, ASCII; canonical key for tags, cities, countries, etc.

## 1. Tag / topic / synonym graph

```
tag_categories (existing)         topic_clusters (NEW)
       ▲                                  ▲
       │ 1..*                             │ 1..*
       │                                  │
   unified_tags ─── tag_synonyms (NEW)  ── search_synonyms (NEW)
       │                                  │
       │  1..*                            │  1..*
       │                                  │
   unified_tag_assignments  ────►  Meilisearch (synonyms applied per index)
       │
       │  ── attaches to ──►   any entity (venue, event, ...)
```

- **Topic clusters (new)**: `topic_clusters (id, slug, name, description, parent_cluster_id)`. A cluster is *queryable*: e.g. `pride-europe-2026` aggregates many tags + entities for facets and editorial pages. Clusters are not categories — they are user-facing topical bundles.
- **`tag_synonyms` (new)**: link table that connects `unified_tags.id` to a `search_synonyms.id`. This is what bridges the editorial taxonomy to the runtime synonym layer.
- **`search_synonyms` (new)**: the runtime synonym table. See schema in doc 03. A row says "in locale X, term `terms[]` should match `replacements[]` in indexes `indexes[]`". The Meilisearch synonym map is *generated* from this table (one truth, push to Meili).
- **Source attribution**: every synonym row carries `source` (`manual | imported | ai-suggested`), `confidence_score`, `status` (`pending | approved | rejected | active`), `created_by`, `approved_by`. Nothing reaches Meili except `status='active'`.

## 2. Entity ↔ search-document contract

Every searchable entity exposes the same minimal contract to the indexer:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Stable across renames |
| `entity_type` | enum | One of the closed list |
| `slug` | text | Stable, locale-neutral; used for URLs |
| `title_i18n` | jsonb `{locale: text}` | At least one entry; English fallback |
| `description_i18n` | jsonb | Optional |
| `tag_ids` | uuid[] | From `unified_tag_assignments` |
| `topic_cluster_ids` | uuid[] | From new join table |
| `geo` | jsonb `{lat,lng,bbox?,polygon_id?,timezone?}` | `lat/lng` validated |
| `temporal` | jsonb `{published_at?, updated_at?, occurrences?[]}` | `occurrences[]` carries `start_at`, `end_at`, `tz`, `rrule?` |
| `images` | jsonb[] `{url, hash, alt?, credit?, license?, score?}` | Hash-deduped |
| `visibility_score` | numeric(4,2) | 0..1; computed by `compute_visibility_score` |
| `freshness_score` | numeric(4,2) | 0..1; decays for old events / stale news |
| `quality_breakdown` | jsonb | Per-axis scores (tags, geo, images, dates, text, synonyms) |

`meilisearch-sync` is the single component that reads this contract and writes Meilisearch documents. The contract is the API; today it is implicit, after this work it is explicit (documented + enforced by `compute_visibility_score`).

## 3. Visibility score

`compute_visibility_score(p_entity_type, p_entity_id) returns jsonb` returns:

```jsonc
{
  "score": 0.78,
  "breakdown": {
    "tags":    { "score": 0.9, "weight": 0.20, "notes": ["3 active tags"] },
    "geo":     { "score": 0.5, "weight": 0.15, "notes": ["lat/lng present", "no timezone"] },
    "images":  { "score": 1.0, "weight": 0.15, "notes": ["1 image, hash present"] },
    "dates":   { "score": 1.0, "weight": 0.10, "notes": [] },
    "text":    { "score": 0.7, "weight": 0.20, "notes": ["title 8 chars, short"] },
    "synonyms":{ "score": 0.6, "weight": 0.10, "notes": ["1 of 2 expected aliases active"] },
    "queries": { "score": 0.5, "weight": 0.10, "notes": ["expected: gay bar berlin — not in top 10"] }
  },
  "suggestions": [
    "Add a German title (title_i18n.de)",
    "Set timezone for accurate 'open now'",
    "Approve alias 'queer bar' → 'gay bar'"
  ],
  "computed_at": "2026-04-28T12:34:56Z"
}
```

Weights are configurable in code (`supabase/functions/_shared/visibility-weights.ts`) and versioned via `search_settings_versions` so the score is reproducible.

## 4. Search settings as data

Today, `searchableAttributes`, `rankingRules`, `filterableAttributes`, `sortableAttributes`, `synonyms`, `typoTolerance`, and the embedder template live in shell scripts. Going forward they are stored in `search_settings_versions`:

- **Desired state**: most recent row per `(index_name, channel='active')`.
- **Applied state**: read from Meilisearch `/indexes/<name>/settings`. Compared against desired; drift surfaced in the admin UI.
- **Versions**: every PATCH writes a new row. `comment`, `created_by`, `created_at` audit who/why.
- **Rollback**: insert a new row whose `settings` equals an older version's; the apply step pushes it to Meili.

Synonyms are derived: `search_synonyms WHERE status='active' AND (locale='*' OR locale=index_locale)` are projected into Meilisearch's `synonyms` map per index.

## 5. Audit log

`search_audit_log` records every admin write that affects search behaviour. Schema in doc 03. UI surfaces filters by actor, action, resource_type. All edge function mutations call `record_search_audit(...)` in the same transaction wherever possible (or as a follow-up RPC otherwise).

## 6. Reindex jobs

`search_reindex_jobs (index_name, scope, status, total, processed, errors[], started_at, finished_at, triggered_by, meili_task_uids[])` is the persistent record of "did this reindex actually finish?". A row is created when the admin presses "Reindex"; the meilisearch-sync function (extended) updates progress and writes the Meili task UIDs. The UI polls.

## 7. Geo, image, date layers

These are not new tables in Phase 0 — they are *captured by the contract above* and surfaced through `compute_visibility_score`:

- **Geo**: missing/invalid coordinates lower the geo axis; warnings list `(0,0)`, `outside country bbox`, `no timezone`.
- **Images**: missing image, missing alt text, missing license, missing hash lower the image axis. Future: perceptual hash + blur score will plug into the same axis without contract change.
- **Dates**: events without `tz`, news without `published_at`, recurring events without rrule, expired but not archived → all visible in the dates axis.

This means Phase 1 ships consistency checks and editor warnings on day one, even before any new geo/image/date tables exist.

## 8. Multilingual handling

- The contract uses `title_i18n` / `description_i18n` (jsonb). Existing `title` / `description` columns continue to be the English source of truth; the indexer reads `title` first, then any future `title_i18n.<locale>` columns.
- Synonyms are per-locale (`locale='de'`) or universal (`locale='*'`). The Meilisearch synonym map is grouped by locale-aware index variants when those exist; today there is one index per type, so locale='*' applies broadly.
- Tag names today are monolingual; doc 03 plans an additive `unified_tags.name_i18n jsonb` column without migrating existing data.

## 9. Constraints honoured

- Old `tags TEXT[]` columns and existing `meilisearch-sync` document shapes continue to work. Nothing in this model is *required* on day one — it is a *target* enforced by visibility score, surfaced as warnings.
- The search-intelligence backend speaks only to Meilisearch admin via the existing env vars (`MEILISEARCH_URL`, `MEILISEARCH_ADMIN_KEY`); no new master keys are introduced.
- The frontend never holds the admin key; all writes flow through the `search-intelligence` edge function gated by `requireAdmin`.

This is the model the rest of the system implements.
