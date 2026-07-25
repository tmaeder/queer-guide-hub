# Geo Hierarchy Unification — countries > cities > villages > places as one taxonomy

## Context

The geo hierarchy (continents → regions → countries → cities → queer_villages) is an FK chain of typed tables with no unified management, weak integrity (a village's `country_id` can contradict its city's; `cities.region_name` is free text; venue/event/hotel geo FKs can disagree), no nested browsing/breadcrumbs, and no entity for parks/beaches/landmarks (only `notable_landmarks text[]` strings). User decision (brainstorming 2026-07-25): **commit to a unified `geo_places` table as the end-state**, delivered **staged** — early phases ship the admin tree, integrity, breadcrumbs, and the new landmark type; later phases complete the physical unification. Goals: (a) unified admin tree management, (b) hard data integrity, (c) nested public browsing/SEO, (d) first-class parks/beaches/landmarks type.

Scope numbers (verified): ~46 inbound FK constraints, ~103 migrations touch geo tables, 137 client call sites in 58 files use `.from('cities'|'countries'|'queer_villages')`.

## Target schema (class-table inheritance — spine + satellites)

Rejected: single sparse mega-table (~140 cols; countries alone have ~80 incl. 17 `lgbti_*` jsonb) and jsonb payloads (breaks pure-SQL truth engines, CHECKs, indexes).

**`geo_places` (spine)** — shared columns only:
- `id uuid PK` — **preserves existing UUIDs on backfill** (makes every later FK flip a constraint swap, not a data rewrite)
- `place_type` enum: `continent | region | country | city | village | landmark` (+ `landmark_kind` on satellite: park/beach/monument/memorial/building/other)
- `parent_id uuid REFERENCES geo_places(id)` + denorm `parent_type` with `UNIQUE(id, place_type)` and composite FK `(parent_id, parent_type)` + per-type CHECKs (`city→country`, `village→city`, `landmark→city|village`). Village-country mismatch becomes impossible *by construction*.
- Trigger-maintained derived ancestors `country_id`, `city_id` (self-FKs, never user-writable) so `location_is_high_risk` and gating stay one-hop
- `name`, `name_normalized`, `name_en/name_de`, `slug` (`UNIQUE(place_type, slug)` — flat routes preserved), `canonical_key` generated, lat/lng, description, image kit, `duplicate_of_id`, `safety_gated`, timestamps

**Satellites** (`place_id uuid PK REFERENCES geo_places ON DELETE CASCADE`, composite-FK type check):
- `geo_country_profiles`: ISO `code`, 17 `lgbti_*` cols, `equality_score`, completeness/enrichment
- `geo_city_profiles`: population/timezone, truth-engine cols (`trust_score`, `completeness_score`, `shell_status`, `field_provenance`, `safety_notes`); `region_name` free text stays until curated into `place_type='region'` nodes
- `geo_village_profiles`: `boundaries` jsonb, history, tags, featured, images
- `geo_landmark_profiles`: `landmark_kind`, address, opening info, accessibility notes

## Phases (each PR-sized, shippable alone)

### P0 — Spine + backfill + dual-write (2 PRs)
Create spine + satellites; backfill from countries (250), cities (~3800), villages preserving UUIDs; triggers on old tables mirror writes to spine. Do NOT touch search_documents yet. Add nightly spine↔typed-table diff job (drift alarm — concurrent-agent-session trap).

### P1 — Landmarks + admin tree + integrity + breadcrumbs (4–5 PRs) ← all user-visible value lands here
1. **Integrity report → backfill → enforce** (log-first): `geo_integrity_violations` view (village/city/country mismatches, venue/event/hotel FK disagreement); batched backfills (most-specific-FK-wins; batched pattern per `20260725120500_recount_tag_usage_batched`); constraint triggers in log-mode for a week (catch scraper/edge-fn writers), then enforce. Never silently overwrite non-NULL mismatches.
2. **Landmarks, native on the spine**: `place_type='landmark'` + `geo_landmark_profiles`; safety gating (`safety_gated` trigger via derived `country_id`, template `20260623160000_safety_layer_entity_gating.sql`) **in the same migration as the type goes live**; search_documents indexer + trigger (template `20260721130737_milestones_search_index.sql`); registrations: `boundaries.entity_type` CHECK, `geo_sources`, `tag_facet_of()`, `content_graph_norm_type()`, `src/config/contentTypeRegistry.ts`, submission registry, merge core in generic dispatcher (`20260724222200_dedup_merge_cores_phase1.sql` pattern). Seed queue: existing `notable_landmarks text[]` → `needs_review` landmark rows (admin-reviewed, not auto-published).
3. **/admin/geography tree UI**: new `src/pages/admin/AdminGeography.tsx` (routes.tsx admin block ~L430). Lazy tree via `get_geo_children` RPC; node panel with counts/integrity flags/safety status + links to existing editors; **Move** = `geo_move_node` RPC (updates FK + re-derives descendants in one tx); **Merge** = existing generic merge dispatcher. Integrity tab with per-row fix buttons.
4. **Public browsing/SEO**: keep flat slugs (link equity; Google reads `BreadcrumbList` JSON-LD, not URL nesting). `get_geo_breadcrumbs` RPC (fixed-depth upward joins); shared `<GeoBreadcrumbs>` (visible + JSON-LD) in Country/City/Village/Place detail pages; `/place/:slug` + `PlaceDetail.tsx` (clone `QueerVillageDetail.tsx`); CityDetail gains "Villages" + "Parks, beaches & landmarks" sections; map places layer; sitemap `/place/*`.

### P2 — FK flips (3–4 PRs)
Re-point ~46 inbound FKs (venues/events/hotels/festivals, news join tables, favorites, trips, `city_aliases`, `geo_sources`, personalities, orgs/milestones/user_place_marks/intimate_profile) to `geo_places(id)` with type checks. `NOT VALID` → `VALIDATE CONSTRAINT` in follow-ups; chunk by table group to limit lock queueing on hot tables.

### P3 — Engine/trigger/RPC rewrites (6–8 PRs, each testable)
Recreate against spine+profiles while dual-write keeps parity: search sync triggers (`20260531155351`), safety-gated recompute chain (`20260623160000-2`), truth engines (city `20260607100000/110000/130000`, safety composer `20260608000001`, village, country), merge cores (collapse three per-type cores → one geo core — net simplification), RPCs signature-compatible under same names (`resolve_city_and_country`, `gated_count_for_location`, `location_is_high_risk`, `search_hybrid` facets, `admin_content_graph`, `admin_entity_neighbors`). **Golden-set safety parity test: identical `safety_gated` output old-vs-new is a hard gate before P4.**

### P4 — Table→view swap (3 PRs: villages first, cities, countries last)
Per type, one transactional migration: drop dual-write triggers, `DROP TABLE`, `CREATE VIEW ... WITH (security_invoker = true)` joining spine+profile, `INSTEAD OF` triggers. PostgREST keeps serving the 137 call sites. Precondition: P2 removed inbound FKs, P3 removed trigger/engine deps. Run a `pg_depend` audit script + freeze window (no concurrent agent migrations) before each swap. Caveat: type-gen marks view columns nullable — hand-maintain type overrides until P5.

### P5 — Client migration + view retirement (4–6 mechanical PRs)
Migrate 58 files to `geo_places`/new RPCs, regenerate `src/integrations/supabase/types.ts`, drop views. Optional finale: villages fully become `place_type='village'` rows (slug redirects via existing redirects kit).

## Top risks
1. **Safety-gating regression window** (real-world harm) → golden-set parity test gates P4; landmark gating ships inside its creation migration.
2. **P4 drop-and-swap surprises** in 817-migration history → `pg_depend` audit + freeze window per swap.
3. **Dual-write drift** during P0–P4 → nightly diff job; keep the calendar short.
4. **Trigger storms on disk-constrained DB** → all backfills batched 300–500; never naked `UPDATE geo_places`.
5. **View-nullability breaking TS silently** → type overrides + prioritize P5.

## Effort
~20–24 PRs total. P0+P1 ≈ 2–3 weeks and delivers all four user-facing goals; P2–P5 ≈ 4–6 more weeks completing the physical unification. Natural checkpoint after P1 to reassess pacing.

## Key files
- `supabase/migrations/00000000000000_baseline.sql` (cities L14022, countries L14107, queer_villages L18132, regions L18242, boundaries L13975; ~46 FKs, RLS)
- `supabase/migrations/20260623160000_safety_layer_entity_gating.sql` (gating chain to preserve exactly)
- `supabase/migrations/20260531155351_search_documents_pilot_table_and_sync.sql` (search sync to re-home)
- `supabase/migrations/20260721130737_milestones_search_index.sql` (new-type search template)
- `supabase/migrations/20260724222200_dedup_merge_cores_phase1.sql` (merge-core pattern)
- `supabase/migrations/20260607100000_city_truth_loop_foundation.sql` (truth-engine rewrite template)
- `src/routes.tsx` (geo routes L553–586, admin L430–469), `src/pages/admin/AdminDuplicates.tsx`, `src/pages/QueerVillageDetail.tsx`, `src/pages/Places.tsx`

## Verification
- Per phase: `npm test`, `npm run typecheck`, migration applied via CI db push (watch version-collision trap; check remote `schema_migrations` before merge).
- P0: nightly diff job reports 0 drift for a week before P2.
- P1: create a landmark in admin → appears in search, map, `/place/:slug`, correctly `safety_gated` for a criminalizing-country test row; integrity view count reaches 0 after backfill; breadcrumbs JSON-LD validates.
- P3: golden-set parity (safety_gated, search results, resolve RPC outputs) old-vs-new = identical.
- P4: post-swap smoke on production (queer.guide): city/country/village pages, admin CRUD, /admin/duplicates merge, search facets.
