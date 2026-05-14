# Phase 0 — Analysis

Snapshot of the queer.guide search and content foundations as of 2026-04-28, taken before the Search Intelligence system is layered on top. Every claim in this document references existing code so future work can verify drift.

## A. Tagging system

### State of the world

- Canonical table: `unified_tags` (status, merged_into_id for soft-merges, slug, name, color, image, taxonomy fields). Defined in `supabase/migrations/20250718143334_legacy.sql` and refined through `20260415170500_unified_tag_dedup.sql`.
- Hierarchical taxonomy: `tag_categories` with parent_id (10 root categories seeded by `20260411160000_resources_taxonomy_v2.sql`).
- Aliases / spelling variants: `tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type)` — but not used by Meilisearch synonyms today.
- Assignment join table: `unified_tag_assignments (tag_id, entity_id, entity_type CHECK ('venue','event','article','listing','profile','group'))`. Replaces the legacy `tags TEXT[]` arrays on entities (some still exist in code paths).
- Active tag view: `v_active_tags = WHERE status='active' AND merged_into_id IS NULL`.
- Helper functions (SECURITY DEFINER): `merge_unified_tag()`, `recount_unified_tag_usage()`, `find_unified_tag_duplicates()` (pg_trgm fuzzy dedup).
- Auto-tagging: `supabase/functions/auto-tag-content/` (per-entity OpenAI flow), `automation-auto-tagger`, plus the weekly `tags-ingestion` pipeline (`20260421160000_tags_ingestion.sql`).
- Admin: `src/pages/AdminTags.tsx` with merge UI, alias section, AI bulk create, batch auto-tag, CSV import.

### Findings

1. **Aliases ≠ search synonyms.** `tag_aliases` exists, but Meilisearch synonyms are configured by `meilisearch/configure-indexes.sh` and do not pull from this table. Result: an admin who maps "queer" → "lgbt" in `tag_aliases` does not affect search.
2. **Mixed assignment models.** Some content types still hold `tags TEXT[]`; others rely on `unified_tag_assignments`. The Meilisearch index uses the array form, sourced from joins in `meilisearch-sync`.
3. **Multilingual is implicit.** Tags carry a single `name` and `description` — no `name_i18n jsonb` or `tag_translations` table. UI consumers translate by slug match.
4. **Topic clusters absent.** There are categories (10), but no cluster/topic concept above category for cross-cutting facets ("Pride 2026 in Europe" spans many tags).
5. **Confidence + provenance is inconsistent.** Some auto-tagging stores confidence; aliases do not. There is no single "this tag came from X with confidence Y, approved by Z" trail.

## B. Search system (Meilisearch)

### State of the world

- 9 indexes: `venues, events, cities, countries, news, marketplace, personalities, tags, queer_villages` (`hotels`, `festivals` referenced in `meilisearch-sync` ALL_TYPES but not in configure script).
- Settings are bash scripts: `meilisearch/configure-indexes.sh` (filterable, sortable, searchable, typo tolerance), `meilisearch/configure-hybrid-search.sh` (OpenAI `text-embedding-3-small`, 1536 dims, document templates, `semanticRatio: 0.5`).
- Read path: `workers/search-proxy/` (Cloudflare Worker). Routes: `/search`, `/autocomplete`, `/trending`, `/track`, `/onboarding`, `/similar`, `/feedback`, `/admin/analytics`. RRF fusion of Meili + pgvector, optional reranker, 70/30 query/bias blend, 60 req/min/IP rate limit.
- Write path: `supabase/functions/meilisearch-sync/` triggered by DB webhooks (`X-Webhook-Secret` shared secret) with actions `full-sync | sync-type | upsert | delete | reconcile`.
- Personalization: `personalized_semantic_search`, `get_bias_signal`, `get_user_signal`, `track_user_event`, `v_popular_entities` RPCs/views (per `SEARCH_SYSTEM.md`).
- Analytics: `/admin/analytics` route on the worker, gated by raw `ADMIN_TOKEN` env var (not JWT/role).

### Findings

1. **No code-managed settings.** `searchableAttributes`, `rankingRules`, `synonyms` exist only inside shell scripts run by hand. There is no audit trail of what was applied when, no rollback, no diff between desired and actual.
2. **No synonym table.** Meilisearch synonyms are inline in `configure-indexes.sh`. They cannot be edited by an admin without shell access, and they do not link to `tag_aliases` or `unified_tags`.
3. **Admin analytics auth is weak.** `/admin/analytics` accepts a token equal to an env var. Anyone with the token has full read access. Should move to JWT + admin role check (matching `requireAdmin` semantics elsewhere).
4. **Indexes drift from `ALL_TYPES`.** The configure script lists 9 indexes; the sync function lists 11. `hotels` and `festivals` may not be created in Meili.
5. **No DB↔index reconciliation surface.** `reconcile` action exists but is not wired into any UI; no way to see "X stale docs in Meili, Y missing".
6. **Reindex tasks invisible.** Meilisearch returns task UIDs but they are not stored; no progress UI; no retry tracking.

## C. Geographical data

### State of the world

- `countries` (code, name, continent), `cities` (lat/lng floats, country FK, slug), `queer_villages` (city/country FKs).
- Boundaries: `geo-boundaries-worker/` serves GeoJSON from R2; `tiles-worker/` (submodule) serves PMTiles.
- Per-entity geo lives on the entity (e.g., `venues.latitude/longitude`, plus `_geo` synthesised in `meilisearch-sync` for venues/queer_villages).
- No PostGIS. Lat/lng are doubles. Polygons (e.g., for queer_villages or regions) are not stored in Postgres.

### Findings

1. **Radius RPCs exist; polygon containment does not.** `get_nearby_venues(lat,lng,radius_km,max_results)` and `get_nearby_events(...)` use Haversine on `latitude`/`longitude`. Viewport (bbox) search is delegated to Meilisearch's `_geoBoundingBox`. Route-based and polygon-containment queries are not supported server-side.
2. **PostGIS partially present.** `venues` has a legacy `GEOMETRY(Point, 4326)` column (migration `20250803120349`); other entity types do not. Polygons are not stored anywhere in Postgres.
3. **No coordinate validation.** Nothing guards against (0,0), nulls, swapped lat/lng, or out-of-country points.
4. **Geocoding ad-hoc.** No central `geocode-*` function; the events pipeline has a "geocode" stage that pulls Photon/Nominatim per adapter.
5. **Boundary data lives outside the DB.** GeoJSON tiles served from R2 (`geo-boundaries-worker`, `tiles-worker`) are not joined with city/country rows; `queer_villages` carry a `region_id` FK but no geometry.
6. **Timezones present at city/country level.** `cities.timezone` and `countries.timezone` are stored as strings; events inherit implicitly, with no event-level tz override.

## D. Visual / image data

### State of the world

- Image fields are scattered: `*.image_url`, sometimes `*.images jsonb`, marketplace mirrors images to the `marketplace-images` R2 bucket via `marketplace-image-mirror` with SHA-256 dedup.
- Tag images: `unified_tags.image_url` + `image_alt` + `image_attribution` + `image_license` + `image_prompt` + `image_source`.
- No `image_assets` table that consolidates URL, hash, dimensions, alt text, credit, embedding, quality score.

### Findings

1. **URL hashing exists for news only.** `news_articles.image_hash` (SHA-256 of canonicalised URL) powers `news_image_duplicates` view (`20260427260000_news_quality_image_hash.sql`). No equivalent for venues/events/marketplace; no *perceptual* hashing anywhere.
2. **A flag/curate workflow exists, but only for venues + cities.** `image_flagged BOOLEAN` + `curated_image_url TEXT` (`20260420110000_image_flag_and_curated.sql`); `resolveEntityImage()` prefers curated over flagged. Other entities lack this.
3. **No image embeddings.** Visual similarity is not implemented; only text embeddings exist on entities (1536-dim).
4. **Alt text absent or untrusted.** Often missing on entities; where present, no provenance ("AI generated", "human").
5. **Buckets are scattered.** `country-images`, `village-images` (Supabase Storage); `marketplace-images` (R2). No central `image_assets` registry tying URL → hash → dimensions → license → provenance.

## E. Date / time / recurrence

### State of the world

- `events.start_time TIMESTAMPTZ NOT NULL`, `end_time TIMESTAMPTZ`, `recurrence_rule JSONB` (`{freq,interval,byDay,until,exceptions}`, added in `20260330300000`), `parent_event_id UUID` for recurring series.
- `news_articles.published_at TIMESTAMPTZ NOT NULL`; the base table omits `updated_at` (immutable ingestion).
- `venues.hours JSONB` (per-day shape; no `OpeningHoursSpecification`).
- City/country `timezone` strings; events inherit implicitly via city.
- "Open now" / "tomorrow" filtering happens in the client today.

### Findings

1. **`recurrence_rule` is stored but not expanded.** There is no `event_occurrences` table; "next Friday", "every other Saturday" etc. cannot be filtered server-side. Meilisearch sees only a single `start_time`.
2. **Time zones inconsistent.** TIMESTAMPTZ columns store UTC, but adapter behaviour around naive local times varies; no `events.timezone` override column.
3. **Expiry logic implicit.** Old events linger in the index; reconcile tombstone sweeps remove deleted rows but not expired ones.
4. **Opening hours cannot be queried.** `venues.hours jsonb` has no enforced schema; "open now" requires client-side parsing.
5. **`updated_at` missing on news_articles.** Drift between source updates and our index is unobservable for news.

---

## Cross-cutting findings

- The platform has rich foundations (tags, geo points, images, dates) but **no unified contract** between them and search. Meilisearch is fed flat documents by `meilisearch-sync` with no enforcement of completeness.
- There is no **per-entity Search Visibility Score** or any signal a content editor can use to know "this venue won't appear for queries it should".
- There is no **admin surface** for any of: synonyms, settings, reindex jobs, audit, consistency, visibility, ingestion quality.

The Unified Model (doc 02) and Migration Plan (doc 03) address these gaps without breaking the existing read or write paths.
