# Risks, open questions, and roadmap

## What is shipped (cumulative)

### Phase 0 — foundation
- Phase 0 docs: analysis, unified model, migration plan, architecture, API.
- Migration `20260428130000_search_intelligence.sql` introducing `search_synonyms`, `search_settings_versions`, `search_audit_log`, `search_reindex_jobs`, `search_visibility_scores`, plus `record_search_audit` and a `compute_visibility_score` stub. RLS configured.
- Edge function `search-intelligence` with the routes from doc 05 implemented as a single router. Admin-gated via the existing `requireAdmin` helper.
- Frontend admin page `/admin/search-intelligence` (feature-flagged) with tabs: Overview, Indexes, Search Debugger, Synonyms, Settings, Reindex, Ingestion Quality, Consistency, Audit.
- Tests: synonym validation, visibility score shape, page-render smoke test.

### Phase 1 — production wiring (complete)
- **Production `compute_visibility_score`** per axis (#148) — real per-axis logic across venue, event, news_article, marketplace_listing, personality, city, country.
- **Reindex driver + Reindex tab UI** (#150) — `POST /reindex` synchronously drives `meilisearch-sync`; UI shows progress + job history.
- **Synonym backfill** from `scripts/configure-meili.sh` (#151) — 6 venue synonyms imported.
- **Rate limiter** (#161) — 60 mutations/minute/actor against `search_audit_log`.
- **Daily settings drift reconcile cron** (#164) — pg_cron at 04:30 UTC posts to a webhook-secret-gated `/cron/reconcile` route that compares desired vs. applied per-index settings and writes audit rows.
- **Settings drift resolver + version rollback** (#149) — diff UI, one-click apply, version history with rollback.

### Phase 2 — model expansion (complete)
- **`tag_aliases` ⇄ `search_synonyms` bridge** (#153) — backfill + forward trigger; new aliases auto-create `approved` synonyms.
- **`topic_clusters` table + RPC** (#154) — editorial topical bundles + `topic_cluster_entities(slug)`.
- **`unified_tags.name_i18n` + `description_i18n`** (#155) — multilingual columns + locale-aware fallback RPCs.
- **`event_occurrences` table + window RPC** (#159) — schema + `events_in_window(from, to)`.
- **Coordinate validator RPCs** (#162) — `find_invalid_coordinates`, `count_invalid_coordinates` across all geo entities.
- **Event recurrence expansion + nightly cron** (#166) — `expand_event_recurrence` / `expand_all_recurring_events`, cron at 03:15 UTC.
- **PostGIS polygons + entities_in_polygon / entities_along_route / find_polygon_for_point** (#167) — geometry columns on regions + queer_villages, three geo RPCs.
- **`is_venue_open_at` + `venues_open_now`** (#168) — server-side "open now" filtering with timezone awareness.
- **Cluster membership helpers** (#171) — `entity_cluster_ids` fn + `entity_cluster_membership` view + `cluster_entity_counts` view.
- **Schema polish: `events.timezone` + per-entity i18n columns** (#172) — `name_i18n` / `title_i18n` / `description_i18n` on 9 entity tables, `unified_tags.image_alt_i18n` / `image_attribution_i18n`, 7 localized fallback RPCs, `effective_event_timezone`.
- **Visibility queries axis incorporates cluster membership** (#173) — `compute_visibility_score`'s queries axis now reflects cluster count (0.5 → 1.0 over 0–5+ clusters) instead of static 0.5.
- **`cluster_ids[]` + `cluster_slugs[]` on every Meili doc** (#174) — `meilisearch-sync` joins `entity_cluster_membership` per batch.
- **Search proxy reads synonyms from Postgres + KV cache** (#175) — `workers/search-proxy` loads `search_synonyms WHERE status='active'` (5-min KV cache) and merges with the LLM rewrite synonyms; Postgres is now source of truth.
- **Topics tab — cluster CRUD + endpoints** (#179) — list / create / update / publish / archive clusters, link / unlink tags.
- **Occurrence indexing in `meilisearch-sync`** (#181) — events index now emits one Meili doc per active occurrence with `master_event_id` for grouping.

### Phase 3 — foundations + producers (complete)
- **`image_assets` registry + `image_asset_links` + `ai_suggestions` queue** (#169) — schema only; producers and consumers opt in over time.
- **Image mirror dual-write to `image_assets`** (#176) — `fetch-{venue,event,personality,village}-images` upsert into `image_assets` alongside the existing per-entity columns.
- **Image_assets backfill** (#178) — one-shot SQL backfill across 7 entity tables; URL-hash dedup; tag alt + attribution carried over.
- **Suggestions tab — AI review queue + auto-apply** (#180) — list / approve / reject / retry pending `ai_suggestions`. Auto-apply for `tag` / `synonym` / `cluster_membership`; other types remain `approved` for manual application.
- **Anthropic-Claude translation backfill** (#183) — `translate-i18n-batch` edge function + 15-job pg_cron rotation Mon-Thu populates `*_i18n` columns with LGBTQ+-domain context prompts.
- **AI suggestion producer cutover — `auto-tag-content`** — the auto-tagger no longer writes directly to `tag_suggestions` / `unified_tag_assignments`; instead it routes through the `ai_suggestions` queue. High-confidence rows insert as `approved` and auto-apply via the shared `applySuggestion` helper (lifted to `_shared/ai-suggestions.ts`); low-confidence rows land as `pending` for the SuggestionsTab. Partial unique index on `ai_suggestions(entity_type, entity_id, (proposed_value->>'tag_id')) where suggestion_type='tag' and status in ('pending','approved')` enforces idempotency. Other producers (`automation-auto-tagger`, etc.) still write directly — separate PR per producer.
- **AI suggestion producer cutover — `automation-auto-tagger` + `content-automation/modules/auto-tagger.ts`** — both embedding-similarity producers used to push tag rows into `content_changes`, but `apply_content_change` does a generic `UPDATE table SET field = value` and entity tables have no `tags` column, so the auto-apply path was a silent no-op. The cutover routes `field_name='tags'` rows from `_shared/automation-utils.ts:writeChanges` and `writeChangesBatch` into `ai_suggestions` via the same shared helper. High-conf rows auto-apply inline (mirrors `auto-tag-content`); the partial unique index from PR 5 covers idempotency. Non-tag rows still go to `content_changes` as before. The pending-tag budget query in `content-automation/modules/auto-tagger.ts` reads `ai_suggestions` for accurate budgeting; `automation-auto-tagger`'s budget query (which only counts applied assignments) is unchanged. The similarity-reasoning string (`"Tag X matches with 92% similarity"`) is dropped — the numeric `confidence` carries the same signal.

### Infrastructure
- **CI Node 22 bump** (#158) — `.github/workflows/a11y.yml` aligned with `engines.node: >=22`.

## What's still pending (intentionally deferred)

### Deferred — operational decisions
| Item | Why |
| --- | --- |
| **Multilingual embedder migration (768 → 1024)** | Requires full re-embed of ~13k content_embeddings rows + HNSW rebuild + cost approval for CF Workers AI on bge-m3. Documented in `SEARCH_SYSTEM.md`. The `*_i18n` columns + the proxy's keyword-search side already cover most multilingual UX without this. Revisit when there's a clear semantic-multilingual gap. |
| **A/B harness for ranking-rule changes** | 3 PRs and ~1200 LOC for an empty harness. Until specific ranking-rule hypotheses exist to test, the harness sits unused. Park as Phase 4. |

### Deferred — needs follow-up after watching production
| Item | Why |
| --- | --- |
| **Image mirror reader cutover** | Storefront still reads `entity.images[]` / `image_url`. Cut over after dual-write (#176) has been in production ~1 month. |
| ~~**Marketplace `image_hashes JSONB` consolidation**~~ | Shipped: migration `20260429300000` adds a `canonicalize_image_url` SQL helper (twin of the JS one in `_shared/image-assets.ts`) and a BEFORE INSERT/UPDATE OF images trigger on `marketplace_listings` that populates `image_hashes` as `[{url, url_hash, sort_order}, ...]`. `url_hash` uses the same canonicalisation as `image_assets.url_hash`, so consumers can JOIN cleanly. One-shot backfill at the end of the migration populates pre-existing rows. |
| **`fetch-city-images` / `fetch-country-images` `image_assets` integration** | These use Storage uploads (decode + size + license known). Different shape from third-party URL mirroring; deserves its own helper. |
| ~~**Reviewer queue for translations**~~ | Shipped: `translate-i18n-batch` cuts over to `ai_suggestions` with `suggestion_type='translation'`. The shared `applySuggestion` gains a `translation` branch (read-merge-write into `<table>.<field>_i18n`). Producer auto-applies inline (translations don't have an LLM-derived confidence; the JSONB merge is non-destructive to other locales). Idempotency: partial unique index on `(entity_type, entity_id, locale, (proposed_value->>'field')) where status in ('pending','approved')`. |
| **Settings (`master_event_id` distinctAttribute, `cluster_ids` filterable)** | Manual one-time apply via the Settings tab once #181 has reindexed events. Intentionally not auto-applied from a migration. |
| **AI suggestion *producer* cutover (remaining producers)** | `auto-tag-content`, `automation-auto-tagger`, and `content-automation/modules/auto-tagger.ts` shipped above. Remaining direct-tag-write paths (e.g. legacy `fetch-news` direct upsert at line 635) need separate PRs — `fetch-news` cutover is gated on confirming the function is no longer scheduled in production. |
| **Edit-then-approve UI for Suggestions** | Endpoint accepts a new `proposed_value`; UI doesn't expose an edit form yet. |
| **Tag-picker for cluster-tag linking** | Endpoints exist (`POST /clusters/:id/tags`); UI is curl-only today. |

### Polish
- ~~Visibility score axis weights: code constants today, could be in `search_settings_versions` per doc 02.~~ Shipped: migration `20260429280000` seeds the initial active weights row and replaces `compute_visibility_score` to load weights from `search_settings_versions(index_name='visibility_score', channel='active', latest version)` at function entry. Operators tune relevance by inserting a new version row; the TS const at `src/lib/visibilityScore.ts` now documents the seeded defaults and serves as a fallback if the active row is deleted.
- `image_assets.embedding`: jsonb placeholder. Pick a vision model + dimensions before populating.
- ~~`events.timezone` adapter usage — column exists (#172); ingestion adapters need to opt in.~~ Shipped: migration `20260429290000` updates `commit_event_staging_item` to read `timezone` from the normalized JSONB and write it on INSERT/UPDATE; `import-eventbrite-events` and `import-ticketmaster-events` thread their API timezone fields into `eventData`. Follow-up: `bulk-scrape-events` now ports `inferTimezone(city, country)` from the scraper package (via a Deno-compatible `_shared/infer-timezone.ts`) and emits timezone in `mapJsonLdToEvent()` so all three extraction paths (JSON-LD / microdata / RDFa) populate it.
- Remove the legacy Meili `synonyms` map once #175 has been in production for ~1 week.

## Risks (current)

1. **Drift between this work and the existing shell-script-driven settings.** Mitigation: `GET /indexes/:name/settings?source=applied` snapshots Meili into `search_settings_versions`; the reconcile cron (#164) detects drift daily; the Settings tab (#149) makes resolution one click.
2. **`compute_visibility_score` stays pinned to a 7-axis weighted average.** A tag-heavy entity that lacks dates can score the same as a date-heavy entity that lacks tags. Acceptable for v1; revisit if Ingestion Quality reviewers report misleading scores.
3. **Recurrence expansion is a partial RFC 5545 implementation.** `BYMONTHDAY`, `BYWEEKNO`, `BYSETPOS`, `BYHOUR`, `COUNT` are unsupported; the migration doc lists every fallback explicitly. If editorial events grow beyond DAILY/WEEKLY/MONTHLY/YEARLY + `byDay`, this will need a real RRULE engine.
4. **PostGIS RPCs use on-the-fly `ST_MakePoint`** for entities without a geometry column. Fine for catalog sizes today; if route-based queries become hot, generated geometry columns + GIST indexes per entity table are the next step.
5. **`is_venue_open_at` returns NULL for unrecognised hours shapes.** The UI must distinguish "closed" from "unknown"; today's default UI treats both as "not open now", which under-surfaces venues with missing data. A schema-enforcement migration would tighten this.
6. **Webhook-secret pattern for cron routes.** `app.search_intelligence_webhook_secret` GUC + `SEARCH_INTELLIGENCE_WEBHOOK_SECRET` env var must both be set before #164's cron does anything useful. Same pattern for #183 (`app.translate_i18n_webhook_secret` / `TRANSLATE_I18N_WEBHOOK_SECRET`). Until then the daily POSTs return 401 (no behaviour change; visible in audit log).
7. **Feature flag `VITE_FEATURE_SEARCH_INTELLIGENCE`** still gates the admin UI. Backend is fully usable via curl by admins.
8. **Translation quality** (#183). LLM auto-translations now route through `ai_suggestions` (PR 7 of the producer-cutover series) instead of writing entity tables directly. Every translation gets an audit row visible in the SuggestionsTab; reviewers can reject and the partial unique index on `(entity_type, entity_id, locale, (proposed_value->>'field'))` lets the cron skip items already in flight. If a quality issue is caught, set `status='rejected'` and the next cron will re-translate (terminal-state rows don't block the index).
9. **Occurrence indexing breaks the events index shape**. After #181's first reindex, the events index has multiple docs per series (one per occurrence). Storefront list pages need `distinctAttribute = master_event_id` set or they'll show duplicates. Deliberate manual step via the Settings tab, not auto-applied.

## Open questions

- Should `search_synonyms.locale` join to a future `locales` table, or stay as a free-form BCP-47 string? *(Current: free-form with regex check.)*
- ~~Visibility score axis weights belong in code or in `search_settings_versions`? Doc 02 says configurable; current migration ships them as constants for reproducibility.~~ Resolved: migration `20260429280000` moves them into `search_settings_versions`, with the TS const kept as a reference default + fallback.
- Where does `image_assets.embedding` go — `vector(768)` (current text embedder), `vector(1024)` (post bge-m3), or stay as `jsonb` until a vision model is selected?

## Roadmap (forward)

**Phase 4 (optional, when justified):**
- Multilingual embedder migration (Q7).
- A/B ranking harness (Q8).
- Production-data-driven follow-ups: AI producer cutover, image-reader cutover, perceptual hash backfill, edit-then-approve UI, tag-picker UI.

The core Search Intelligence system (Phases 0–3) is **complete and shipped**. Future work is incremental — no foundational pieces remain.
