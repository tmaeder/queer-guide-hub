# Risks, open questions, and roadmap

## What is shipped (cumulative)

### Phase 0 — foundation
- Phase 0 docs: analysis, unified model, migration plan, architecture, API.
- Migration `20260428130000_search_intelligence.sql` introducing `search_synonyms`, `search_settings_versions`, `search_audit_log`, `search_reindex_jobs`, `search_visibility_scores`, plus `record_search_audit` and a `compute_visibility_score` stub. RLS configured.
- Edge function `search-intelligence` with the routes from doc 05 implemented as a single router. Admin-gated via the existing `requireAdmin` helper.
- Frontend admin page `/admin/search-intelligence` (feature-flagged) with tabs: Overview, Indexes, Search Debugger, Synonyms, Settings, Reindex, Ingestion Quality, Consistency, Audit.
- Tests: synonym validation, visibility score shape, page-render smoke test.

### Phase 1 — production wiring
- **Production `compute_visibility_score`** per axis (#148) — real per-axis logic across venue, event, news_article, marketplace_listing, personality, city, country.
- **Reindex driver + Reindex tab UI** (#150) — `POST /reindex` synchronously drives `meilisearch-sync`; UI shows progress + job history.
- **Synonym backfill** from `scripts/configure-meili.sh` (#151) — 6 venue synonyms imported.
- **Rate limiter** (#161) — 60 mutations/minute/actor against `search_audit_log`.
- **Daily settings drift reconcile cron** (#164) — pg_cron at 04:30 UTC posts to a webhook-secret-gated `/cron/reconcile` route that compares desired vs. applied per-index settings and writes audit rows.
- **Settings drift resolver + version rollback** (#149) — diff UI, one-click apply, version history with rollback. *(Open at time of writing.)*

### Phase 2 — model expansion
- **`tag_aliases` ⇄ `search_synonyms` bridge** (#153) — backfill + forward trigger; new aliases auto-create `approved` synonyms.
- **`topic_clusters` table + RPC** (#154) — editorial topical bundles + `topic_cluster_entities(slug)`.
- **`unified_tags.name_i18n` + `description_i18n`** (#155) — multilingual columns + locale-aware fallback RPCs.
- **`event_occurrences` table + window RPC** (#159) — schema + `events_in_window(from, to)`.
- **Coordinate validator RPCs** (#162) — `find_invalid_coordinates`, `count_invalid_coordinates` across all geo entities.
- **Event recurrence expansion + nightly cron** (#166) — `expand_event_recurrence` / `expand_all_recurring_events`, cron at 03:15 UTC.
- **PostGIS polygons + entities_in_polygon / entities_along_route / find_polygon_for_point** (#167) — geometry columns on regions + queer_villages, three geo RPCs.
- **`is_venue_open_at` + `venues_open_now`** (#168) — server-side "open now" filtering with timezone awareness.

### Phase 3 — foundations
- **`image_assets` registry + `image_asset_links` + `ai_suggestions` queue** (#169) — schema only; producers and consumers opt in over time.

### Infrastructure
- **CI Node 22 bump** (#158) — `.github/workflows/a11y.yml` aligned with `engines.node: >=22`.

## What's still pending — by phase

### Phase 2 — admin UI + ingestion integration
| Item | Why it's deferred |
| --- | --- |
| Admin UI for cluster CRUD (Tags & Topics tab) | Frontend work; cluster-tag picker + entity-preview UX. |
| `cluster_ids[]` synced onto Meilisearch documents | Touches `meilisearch-sync`; needs decision on facet shape. |
| Bridge `topic_cluster_entities` → `search_visibility_scores` | Update `compute_visibility_score`'s queries axis. |
| Index event occurrences as separate Meili documents | Touches `meilisearch-sync`; significant indexing-shape change. |
| Per-entity `name_i18n` for venues / events / news / marketplace | Same pattern as #155 for tags; deferred until a translation source is wired. |
| `name_i18n` backfill | Needs a translation source (DeepL / Anthropic Translate / curated). |

### Phase 3 — full implementations on top of the foundations
| Item | Status |
| --- | --- |
| Image mirroring writes to `image_assets` | Schema ready (#169); need to teach `marketplace-image-mirror` and `fetch-village-images` to upsert. |
| Perceptual hash + content_hash population | Needs a worker that downloads + hashes; not wired. |
| Image embeddings (CLIP / bge-vision) | Cost + storage decisions outstanding; the column is `jsonb` placeholder. |
| AI suggestion producers (auto-tag-content writes to `ai_suggestions`) | Schema ready; existing AI taggers continue to write tags directly until cut over. |
| Admin UI: AI suggestion queue (Tags & Topics → Suggestions) | Frontend work. |
| A/B harness for ranking-rule changes | Worker-level traffic split + metrics table. |
| Multilingual embedder migration (bge-base-en-v1.5 → bge-m3, 768 → 1024 dims) | Documented in `SEARCH_SYSTEM.md` known-follow-ups; requires full re-embed + HNSW rebuild. |

### Polish
- Search proxy reads synonyms from Postgres directly (currently from the Meili `synonyms` map only). Open question per doc 06.
- `events.timezone` override column for adapters that store local times.
- `unified_tags.image_alt_i18n` — locale-aware alt text on tag images.
- Strict JSONB schema enforcement for `venues.hours` (shape contract + trigger). The `is_venue_open_at` RPC (#168) handles freeform shapes today.
- Auto-fix actions ("re-geocode all missing", "delete orphans in Meili", "rebuild image hashes"). Each is a small follow-up integrating an existing pipeline.

## Risks (current)

1. **Drift between this work and the existing shell-script-driven settings.** Mitigation: `GET /indexes/:name/settings?source=applied` snapshots Meili into `search_settings_versions`; the reconcile cron (#164) detects drift daily; the Settings tab (#149) makes resolution one click.
2. **`compute_visibility_score` stays pinned to a 7-axis weighted average.** A tag-heavy entity that lacks dates can score the same as a date-heavy entity that lacks tags. Acceptable for v1; revisit if Ingestion Quality reviewers report misleading scores.
3. **Recurrence expansion is a partial RFC 5545 implementation.** `BYMONTHDAY`, `BYWEEKNO`, `BYSETPOS`, `BYHOUR`, `COUNT` are unsupported; the migration doc lists every fallback explicitly. If editorial events grow beyond DAILY/WEEKLY/MONTHLY/YEARLY + `byDay`, this will need a real RRULE engine.
4. **PostGIS RPCs use on-the-fly `ST_MakePoint`** for entities without a geometry column. Fine for catalog sizes today; if route-based queries become hot, generated geometry columns + GIST indexes per entity table are the next step.
5. **`is_venue_open_at` returns NULL for unrecognised hours shapes.** The UI must distinguish "closed" from "unknown"; today's default UI treats both as "not open now", which under-surfaces venues with missing data. A schema-enforcement migration would tighten this.
6. **Webhook-secret pattern for cron routes.** `app.search_intelligence_webhook_secret` GUC + `SEARCH_INTELLIGENCE_WEBHOOK_SECRET` env var must both be set before #164's cron does anything useful. Until then, the daily POST returns 401 (no behaviour change; visible in audit log).
7. **Feature flag `VITE_FEATURE_SEARCH_INTELLIGENCE`** still gates the admin UI. Backend is fully usable via curl by admins.

## Open questions

- Should `search_synonyms.locale` join to a future `locales` table, or stay as a free-form BCP-47 string? *(Current: free-form with regex check.)*
- Should the read path (`workers/search-proxy`) read synonyms from Postgres directly, or rely on the Meili `synonyms` map? *(Current: Meili map only; simpler, but adds latency to synonym changes.)*
- Visibility score axis weights belong in code or in `search_settings_versions`? Doc 02 says configurable; current migration ships them as constants for reproducibility.
- Where does `image_assets.embedding` go — `vector(768)` (current text embedder), `vector(1024)` (post bge-m3), or stay as `jsonb` until a vision model is selected?
- Cluster ↔ entity surface in Meilisearch: `cluster_ids[]` as a filterable array on each doc, or a separate `clusters` index that joins?

## Roadmap (forward)

**Phase 1 (effectively done — open for review):** #149 settings drift UI is the final functional piece.

**Phase 2 (most schema landed; admin UI + ingestion integration left):** cluster CRUD UI, occurrence-aware Meili indexing, per-entity i18n backfill, cluster-as-facet on indexed docs.

**Phase 3 (foundations landed; producers/consumers left):** image mirroring upgrade to `image_assets`, AI suggestion producers + admin queue UI, multilingual embedder migration, A/B harness.

**Search proxy upgrades (not in this work stream):** synonyms-from-DB, embedder-via-AI-Gateway redundancy, cold-start improvements documented in `SEARCH_SYSTEM.md`.
