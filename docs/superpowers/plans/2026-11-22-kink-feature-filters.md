# Kink & feature filters — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** filter and browse parties, events and venues by venue feature and kink, with every term a glossary tag.

**Architecture:** a registry table (`kink_filter_terms`) marks which `unified_tags` rows are filters. The `tags` text
arrays on `events`/`venues` stay the filter column; a trigger mirrors registry slugs from those arrays into
`unified_tag_assignments`, and a second trigger mirrors venue amenities into the array. Two anon RPCs serve the
term list (with counts) and one term. The UI reads the registry, gates on `useAgeAffirmation`, and writes `?tags=`.

**Tech stack:** Postgres (Supabase migrations), React 19 + TanStack Query, vitest, Playwright.

Spec: `docs/superpowers/specs/2026-11-22-kink-feature-filters-design.md`.

## Deviations from the spec (decided while planning, from measured facts)

1. **No single writer function.** The sync is a trigger on the `tags` array instead, so every existing writer
   (ingest commit, admin edits, review approval) stays in sync without being changed.
2. **Review-only terms queue for venues only.** `review_field_registry` is generic (`target_table`,
   `text_array_union`) and the venue quality inbox exists. There is no event quality inbox; building one means a new
   `triage_src_*` view inside a 17-view UNION (the type-drift trap that once took the inbox down for six weeks).
   Ambiguous terms are therefore not applied to events in this pass and are counted by the sentinel.
3. **`socks` is not seeded.** Its row is the generic sense ("Footwear worn under shoes"). The fetish sense lives in the
   new `sneakers` tag.
4. **Tag pages already list venues and events** (`TagLinkedContent` via `get_tag_linked_content`, with "See all").
   PR 4 only fixes event ordering (it shows past events first today), drops merged rows, and adds the anon+18+ path.

## Files

| File | Responsibility |
|---|---|
| `supabase/migrations/<v1>_kink_filter_terms.sql` | tags, merges, registry, sync triggers, backfill, RPCs, ordering fix |
| `supabase/migrations/<v2>_kink_tag_fill.sql` | text-match fill fn, cron, review registration, sentinel |
| `src/lib/__tests__/kinkFilterTerms.test.ts` | guard test over comment-stripped SQL for both migrations |
| `scripts/check-pipeline-health.mjs` | wire `kink_filter_signals()` |
| `src/hooks/useKinkFilterTerms.ts` | fetch registry + counts (`kink_filter_terms_list`) |
| `src/components/kink/KinkFilterGroup.tsx` (+ test) | chip rows, 18+ lock, toggles a `tags` array |
| `src/components/events/EventFiltersPanel.tsx` | mount group, wired to `selectedTags` |
| `src/components/venues/VenueFilters.tsx` | mount group, wired to `f.selectedTags` / toggle |
| `src/pages/KinkHub.tsx` (+ test) | `/kink` hub |
| `src/pages/TagDetail.tsx` | anon+18+ path for registry terms |
| `src/routes.tsx`, `functions/_lib/appRoutes.json` | `/kink` route (manifest regenerated) |
| `e2e/kink-filters.spec.ts` | prod e2e |

## PR 1 — registry and sync (migration v1)

- [ ] **1.1 Allocate version:** `node scripts/next-migration-version.mjs --create kink_filter_terms`.
- [ ] **1.2 Create missing tags** `sling`, `sneakers`, `dress-code`, `naked-party`, `underwear-party`: `status='active'`,
  `is_adult=true`, `is_sensitive=true` (dress-code: not sensitive), `seo_indexable=false`, `publication_role='utility'`,
  `human_reviewed=true` (escape hatch from `deprecate_unused_tags`), explicit `publication_role` (NOT NULL, no default),
  and all three category representations by hand (`category`, `category_id`, primary `tag_category_assignments` row) —
  neither category trigger fires on INSERT. Insert with `on conflict (slug) do nothing`.
- [ ] **1.3 Merges:** `merge_tag_concept(cruising-area → cruising)`; `gloryhole` is deprecated with 0 uses — leave it.
  Guard: skip when already merged. Demote the loser's primary category row first (23505 trap).
- [ ] **1.4 Registry table** `kink_filter_terms(tag_id pk fk, term_group check feature|kink, sort int, amenity_slug text
  fk amenities(slug), applies_to text[] check <@ {events,venues} and non-empty, public_without_18 bool, enabled bool)`.
  RLS on; no direct grants to anon/authenticated (served via definer RPCs); admin write policy.
- [ ] **1.5 Seed** (by slug join, so a missing tag is a postcondition failure, not a silent skip):
  features darkroom(amenity darkroom, public), sling, glory-hole, sauna(public), steam-room(amenity steam-room, public),
  cruising(amenity cruising-area), private-cabins? — only if tag exists, else skip with notice; hot-tub (amenity hot-tub,
  only if tag exists), dress-code, naked-party, underwear-party; kinks fisting, piss-play, bondage, bdsm, leather,
  rubber, puppy-play, spanking, cock-and-ball-torture, sneakers.
- [ ] **1.6 Sync trigger** `kink_tags_sync_assignments()` AFTER INSERT OR UPDATE OF tags on events and venues: for each
  registry slug in NEW.tags insert the assignment (entity_type `event` / `venues`, matching existing rows), and delete
  registry-tag assignments whose slug left the array. Only registry tags — other tags untouched.
- [ ] **1.7 Amenity mirror trigger** `kink_amenity_to_tags()` BEFORE INSERT OR UPDATE on venues (unscoped, `zz_` name so
  it runs after other BEFORE triggers): append registry slug when its `amenity_slug` is in `NEW.amenities`.
- [ ] **1.8 Backfill** amenity mirror in batches of 300 (search trigger cost) via a `run_kink_amenity_backfill(batch)`
  function looped in the migration; then backfill assignments for arrays that already carry registry slugs.
- [ ] **1.9 RPCs** (SECURITY DEFINER, `set search_path=''`, granted anon+authenticated):
  `kink_filter_terms_list()` → `slug,name,short_description,term_group,sort,applies_to,public_without_18,event_count
  (upcoming, live, non-dup; safety_gated excluded unless auth.uid()),venue_count` for enabled registry rows only;
  `kink_filter_term(p_slug)` → same row + `tag_id`, null for anything not in the registry.
- [ ] **1.10 Ordering fix** in `get_tag_linked_content` events: `order by (e.start_date >= now()) desc,
  case when e.start_date >= now() then e.start_date end asc, e.start_date desc`; add `e.duplicate_of_id is null`.
  Patch via `pg_get_functiondef` + exactly-once `replace`, never restate.
- [ ] **1.11 Postconditions** (DO block, RAISE): every seeded slug present in registry; every registry tag active and
  unmerged; zero venues with a mapped amenity but missing the slug; zero registry-slug array/assignment disagreements;
  `kink_filter_term('pedophilia')` style probe for a non-registry sensitive tag returns null.
- [ ] **1.12 Guard test** `src/lib/__tests__/kinkFilterTerms.test.ts` (comment-stripped SQL): definer RPCs filter by
  registry; `search_path=''`; safety_gated predicate present in both counts; sync trigger deletes only registry tags;
  postconditions RAISE. Run `npx vitest run src/lib/__tests__/kinkFilterTerms.test.ts`.
- [ ] **1.13 Dry-run on prod** in a transaction forced to roll back; then commit, PR, merge, verify by NAME in
  `schema_migrations`.

## PR 2 — text fill, cron, sentinel (migration v2)

- [ ] **2.1 Measure precision** per term on prod (sample ≤30 per term, events+venues, word-boundary regex over
  title/name+description). Record term, n, correct in the migration header. ≥95% → `auto_terms`; else `review_terms`.
- [ ] **2.2** `run_kink_tag_fill(p_batch int default 300)` with a per-term pattern table `kink_filter_patterns(tag_id,
  pattern, auto bool)`: auto terms append slug to `tags` (events + venues per `applies_to`); review terms open
  `entity_review_queue` rows for venues (`field='tags'`, `proposed_value=jsonb array`) using skip-if-open +
  rejected-value suppression. Cursor: `enrichment_status.kink_tag_fill.at` stamped on every visit.
- [ ] **2.3** Register `review_field_registry('venue','tags', target venues.tags, text_array_union, batchable false)`.
- [ ] **2.4** Cron `kink_tag_fill` `25 4 * * *` + `admin_automations` row in the same migration.
- [ ] **2.5** `kink_filter_signals()` (service_role only): `probe_ok, registry_rows, broken_registry_rows,
  array_assignment_disagreements, amenity_unmirrored, open_review_rows`. Wire into `check-pipeline-health.mjs` before the
  terminal exit: hard-fail on broken/disagreements/unmirrored, 404 warns.
- [ ] **2.6** Extend guard test; dry-run; PR; merge; verify.

## PR 3 — filters

- [ ] **3.1** `useKinkFilterTerms(appliesTo)` → `useQuery(['kink-filter-terms'], rpc kink_filter_terms_list)`, filtered
  client-side by `applies_to`.
- [ ] **3.2** `KinkFilterGroup({ appliesTo, selected, onToggle })`: two rows (Features, Kinks) of toggle chips with
  counts; 0-count muted; without `useAgeAffirmation().affirmed` render only `public_without_18` chips plus a button
  "Show kink & fetish filters (18+)" that calls `affirm` after the existing `AdultContentGate` dialog. Test:
  locked shows button and public chips only; unlocked shows all; clicking chip calls `onToggle(slug)`.
- [ ] **3.3** Mount in `EventFiltersPanel` ("What" section) toggling `selectedTags`; mount in `VenueFilters` toggling via
  the existing tag toggle in `useVenueFilters`.
- [ ] **3.4** Cards: skipped this pass (YAGNI; the filter + tag page carry it). Recorded in PR body.
- [ ] **3.5** `npm test -- kink`, `npm run typecheck`, `npm run lint`; PR; merge.

## PR 4 — pages

- [ ] **4.1** `src/pages/KinkHub.tsx` at `/kink`: gate with `AdultContentGate active`, list terms grouped with counts,
  link to `/tags/:slug`; `useMeta({ noIndex: true })`. Route in `src/routes.tsx`; run
  `node scripts/agent-route-manifest.mjs`.
- [ ] **4.2** TagDetail: when `!tag`, call `kink_filter_term(slug)`; if it returns a row and the visitor is 18+
  affirmed, render name + short description + `TagLinkedContent`; else keep `GatedDetailFallback`.
- [ ] **4.3** Link `/kink` from `KinkFilterGroup` ("Browse all").
- [ ] **4.4** Tests, typecheck, lint; PR; merge; wait for Pages deploy.

## E2E on prod

- [ ] `e2e/kink-filters.spec.ts`: anon without 18+ on `/events` sees the lock button and public chips; after confirming,
  kink chips render and `/events?tags=fisting` returns results; `/kink` lists ≥15 terms with counts; `/tags/darkroom`
  events section shows an upcoming date first; anon with 18+ on `/tags/fisting` sees the term, not the sign-in gate.
  Run `PLAYWRIGHT_BASE_URL=https://queer.guide npx playwright test e2e/kink-filters.spec.ts`.
