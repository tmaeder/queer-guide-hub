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

> **AMENDED after the 2026-07-26 attempt (#2336, rolled back same hour, #2338):** all 62
> external FKs were flipped to the satellite PKs (`geo_*_profiles.place_id` — type-safe,
> the right target) and every constraint validated cleanly, but **PostgREST resolves
> embeds through FK relationships**: the moment `venues.city_id` stopped referencing
> `cities`, every client `cities:city_id(...)`/`countries:country_id(...)` join spec
> returned 42703 in production. FK flips for any table the frontend embeds from are
> therefore **sequenced AFTER the client embed migration** (P5 reordered before P2 for
> those call sites), or must ship together with compatibility views. The support/audit
> tables with no client embeds (city_aliases, quality signals, merge audits, slug
> redirects, coverage gaps, geo_sources) CAN flip early — but a partial flip splits the
> FK topology in two, so prefer one coordinated pass. Deep parity verification
> (field-level, on-demand) proved a valid substitute for the calendar soak; the spine
> mirror held exactly under live traffic throughout.
>
> **P2 COMPLETED 2026-07-27 (embed-first redo, PRs #2358 + #2363):** sequence was
> (1) hint-drop client edits (`cities:city_id(...)` → bare `cities(...)`; named
> computed rels `primary_city`/`primary_country` on trips, `birth_city` on
> personalities) deployed first, (2) per-batch migrations creating **PostgREST
> computed relationships** (forward `rows 1` + reverse for `venues(count)`/
> `events(count)` from city/village lists) atomically with the FK flips to the
> satellite PKs. Pilot-proven constraint: **computed relationships OVERRIDE
> same-named FK relationships**, so hinted embeds must be gone before the rels
> exist. Verified live: 10/10 exact client-spec embeds, `!inner` + `count()`
> through computed rels, write-path with wrong-type rejection, drift 0, browser
> UI pass. All 62 external geo FKs now reference `geo_*_profiles(place_id)`.
> Bonus: `city_favorites`/`country_favorites` embeds work for the first time
> (those tables never had FKs). P3 preconditions from this phase are met.

### P3 — Engine/trigger/RPC rewrites (6–8 PRs, each testable)
Recreate against spine+profiles while dual-write keeps parity: search sync triggers (`20260531155351`), safety-gated recompute chain (`20260623160000-2`), truth engines (city `20260607100000/110000/130000`, safety composer `20260608000001`, village, country), merge cores (collapse three per-type cores → one geo core — net simplification), RPCs signature-compatible under same names (`resolve_city_and_country`, `gated_count_for_location`, `location_is_high_risk`, `search_hybrid` facets, `admin_content_graph`, `admin_entity_neighbors`). **Golden-set safety parity test: identical `safety_gated` output old-vs-new is a hard gate before P4.**

> **P3 STEP 1 SHIPPED 2026-07-27 (PR #2371).** Delivered:
> - **The P4 hard gate exists**: `geo_safety_parity_check()`. Because
>   `location_is_high_risk` is *pure* over `(country_id, city_id)`, covering every
>   pair in use + every city + every country + the null cases is an exhaustive
>   proof, not a sample. Result: **7,698 pairs, 0 mismatches, 575 high-risk both
>   ways, 0 stale stored flags.** Re-run this before every subsequent step.
> - **Safety chain reads the spine**: `location_is_high_risk` +
>   `recompute_safety_gated_for_country`.
> - **Ordering hazard found and fixed** (would have silently corrupted gating):
>   AFTER triggers fire alphabetically, so `trg_countries_recompute_safety_gated`
>   ran BEFORE `trg_sync_geo_spine` — recomputing while the spine profile was
>   still stale. Harmless while the predicate read typed tables; wrong the moment
>   it reads the spine. Trigger relocated to `geo_country_profiles`, making the
>   order correct by construction. **Generalise this: any trigger that consumes
>   spine data must fire FROM the spine, never from a typed table.**
> - **Search-sync triggers** for city/country/village moved onto `geo_places`
>   (dual-write propagates in-transaction, so firing frequency is unchanged).
>
> **Deliberately still on the typed tables**: the BEFORE triggers (`auto_slug_from_name`,
> `*_maintain_normalized`, `sanitize_website_field`) mutate NEW *before* the typed
> row is written, so moving them early would break NOT NULL on `slug`. They move
> as part of the P4 swap itself, re-created on the spine with the INSTEAD OF
> routing. Also still pending: `trg_cities_mirror_historical_names` (AFTER, would
> move to `geo_city_profiles`), the truth engines, and the merge-core collapse.
>
> **Useful discovery for P3 remainder**: read-only RPCs do *not* all need rewriting —
> a faithful P4 view is transparent to them. The genuinely forced work is triggers
> (impossible on views) and multi-table writes (which need INSTEAD OF routing).

### P4 — Table→view swap (3 PRs: villages first, cities, countries last)
**Prepared, not executed — needs a scheduled freeze window. Runbook: [`docs/deploy/geo-p4-view-swap-runbook.md`](../deploy/geo-p4-view-swap-runbook.md).**

Per type, one transactional migration: drop dual-write triggers, `DROP TABLE ... CASCADE`, `CREATE VIEW ... WITH (security_invoker = true)` joining spine+profile, `INSTEAD OF` triggers. PostgREST keeps serving the 137 call sites. Caveat: type-gen marks view columns nullable — hand-maintain type overrides until P5.

Pre-flight is now a function, `geo_p4_preflight()` — re-run it *at window time* (the schema moves under concurrent agent sessions). Three gates must read 0: `safety_parity_mismatches`, `spine_drift`, `external_fks_on_typed`. It also inventories the swap workload; the audit found more than this plan originally assumed: **8 dependent views** needing drop+recreate under `CASCADE`, 38 indexes, 9 RLS policies, 1 generated column (`cities.canonical_key`, impossible on a view), and the 5 BEFORE triggers.

Why a human window rather than autonomous execution: this is the one irreversible step (recovery = restore from backup, not revert), and the realistic failure mode is a *concurrent* session's migration landing mid-swap — a risk care on the executing side cannot remove.

**Deferred into the swap on purpose:** the truth engines and merge cores read *and write* the typed tables. Rewriting their reads early is cosmetic; rewriting their writes early is actively wrong, because dual-write only flows typed → spine, so spine-only writes would never reach the columns the frontend still reads. Their write target flips exactly when the tables become views.

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
