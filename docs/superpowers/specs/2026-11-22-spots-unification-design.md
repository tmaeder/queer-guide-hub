# Spots: one structure for venues and organizations

Status: design approved 2026-11-22, not started.
Supersedes the "no table merges" decision in `docs/plans/2026-07-26-business-spine-unification.md`
and the "organizations are the canonical identity, every location acquires one" decision in
`docs/plans/2026-10-11-unified-organisation-content-type-design.md` (user decision 2026-11-22,
made with that design on the table).

## Why

Measured on prod 2026-11-22:

- `organizations`: 108,732 live rows. **104,022 are a 1:1 shadow of exactly one venue.**
  Those shadows hold 0 claims, 0 editorial text, 0 legal names. Only 133 logos and
  1,095 extra roles (seller 631, support 421, hotel 27, …) are not already on the venue.
  34 shadows are referenced by hotels / merchants / brands / news sources.
- Real orgs: **4,134 with no venue** (support, advocacy, brand, seller, publisher) and
  **451 chains** owning 2–20 venues.
- `search_documents`: 3,957 organization docs describe the same place as a venue doc,
  so search returns the same bar twice.
- Every fix (dedup, safety gating, logos, enrichment, claim) is built twice: once on the
  96-column `venues`, once on the 48-column `organizations`.

The link-only business spine doubled the corpus instead of unifying it. The goal is one
model, one URL tree, one search document per real-world thing.

## Decisions

| Question | Decision |
|---|---|
| Shape | Narrow spine + profiles (the `geo_places` pattern). Not one wide table. |
| Spine name | `spots` |
| Public URL | `/spots` and `/spots/:slug`. All `/venues*`, `/organizations*`, `/organizer/:slug` 301. |
| Why not `/places` | `/place/:slug` is landmarks; `/places` redirects to `/travel`. |

## 1. Data model

### `spots` (new spine)

| Column | Notes |
|---|---|
| `id uuid` | `= venues.id` for every venue, `= organizations.id` for every real org. No id rewrites. |
| `kind` | `place` (has a door) \| `organization` (exists without one) |
| `roles text[]` | moved from `organizations.roles`, same CHECK vocabulary |
| `parent_id → spots.id` | chain → branch; replaces `venues.organization_id` |
| `slug, name, category, city_id, country_id, latitude, longitude` | shared identity |
| `safety_gated, duplicate_of_id, status, created_at, updated_at` | shared lifecycle |

Invariants:

- No coordinate invariant: 20,043 venues have no coordinates today. A place without
  coordinates is a geocoding backlog, not a different kind.
- Every `venues.id` and every non-folded `organizations.id` has a `spots` row.
- `parent_id` depth ≤ 1, and a parent is `kind = 'organization'`.

### Profiles

- `venues` becomes the place profile, keyed `id = spots.id`. Keeps its kind-specific
  columns. All `venue_*` satellites and the `events` / `festivals` / `trip_places` /
  `marketplace_listings` / `flyer_scans` FKs stay untouched.
- `organizations` becomes the org profile and shrinks to the ~4.6k real rows
  (legal_name, founded_at, dissolved_at, claim, logo).

### Org cohorts

| Cohort | Rows | Fate |
|---|---|---|
| Shadow of exactly 1 venue | 104,022 | Folded into the venue's spot. Copy roles and the 133 logos onto the venue first, repoint the 34 referencing rows to the venue id (possible only after P1 flips those FKs to `spots`), write a slug redirect, snapshot the row into `spot_fold_audit`. |
| Chain (2–20 venues) | 451 | `kind = 'organization'`; branches get `parent_id`. |
| No venue | 4,134 | `kind = 'organization'`, own spot. |

Re-measure all three counts immediately before P1. They are a 2026-11-22 snapshot.

## 2. Backend

### Writers

- The venue pipeline (`commit_venue_staging_*`, enrichers, merge cores) keeps writing
  `venues`. Trigger `trg_sync_spot` mirrors identity columns into `spots`, same shape as
  `trg_sync_geo_spine`. No edge-function change in P0.
- `commit_health_service_org` and org CRUD keep writing `organizations`; the same trigger
  mirrors them.
- Shadows have two producers and both are retired in P2: the `org_spine_backfill` cron and the
  `cms_location_identity_insert` trigger on `venues`, which mints an org for every new venue
  (`cms_venue_organisation_core`, from `99991791725037`). `zz_location_org_sync` and
  `zzz_venue_gate_to_org` stop having work once the shadows are gone.
- `org_spine_backfill` is retired: Disable the
  `admin_automations` row first, then guarded unschedule. Never DELETE the row.
- `link_organization_entity` for venues becomes "set `parent_id`".

### Slugs

3,209 slugs are shared between a venue and an org; 1,943 are a venue and its own shadow
(resolved by the fold), 1,266 are different entities. `spots.slug` is NOT unique in P0-P2.
Before P3 the 1,266 get a deterministic suffix on the org side (old slug kept as a redirect),
then a unique index lands.

### Search

- One indexer reads `spots`, so each spot has exactly one `search_documents` row.
- `entity_type` strings stay `'venue'` and `'organization'`. They are baked into
  favorites, guide_picks, tag assignments and embeddings. Their meaning becomes
  "spot of kind place / organization".

### Safety

`safety_gated` is computed once on `spots` with the real two-term rule:
`location_is_high_risk(country_id, city_id) OR category = 'cruising'`.
It is mirrored back to `venues` and `organizations` so existing RLS works unchanged.
Read the live BEFORE trigger before writing this; never reconstruct the rule from memory.

### SEO and edge

- `functions/_lib/detail.ts`: `venueDetail` becomes `spotDetail` for both kinds. Orgs gain
  crawler pages they never had.
- `sitemap-spots.xml` replaces `sitemap-venues.xml`.
- `/venues/:slug` and `/organizations/:slug` → `/spots/:slug` as static `_redirects`
  pattern rules. Shadow-org slugs that differ from the venue slug resolve through
  `spot_slug_redirects`.

### Phases

Each phase ships alone and is reversible. P1 must precede P2: after P0, `spots` holds both venue ids and org ids, so the FKs can target it before any org row is folded away.

| # | Change | Gate to proceed |
|---|---|---|
| P0 | `spots` table, `trg_sync_spot`, backfill, nightly `spots_drift_check()` | 7 clean drift nights |
| P1 | FK flips: `hotels` / `marketplace_merchants` / `marketplace_brands` / `news_sources` / `affiliate_partners` `.organization_id` → `spot_id` referencing `spots(id)`; `venues.organization_id` → `parent_id` for chains | 0 orphans |
| P2 | Fold shadows in batches ≤300 with audit; retire `org_spine_backfill` | shadow count 0, 34 referencing rows resolve, drift 0 |
| P3 | One search indexer, `spotDetail`, `sitemap-spots.xml` | duplicate search docs = 0 |
| P4 | Frontend `/spots` + redirects | e2e green, crawler 200s on sampled old URLs |
| P5 | Drop `venues.organization_id`, old indexers, `sitemap-venues.xml`, old hooks | 30 days of P4 in prod |

## 3. Frontend

### Routes

- `/spots` → `src/pages/Spots.tsx`, replacing `Venues.tsx` and `Organizations.tsx`.
- `/spots/:slug` → `<EntityDetail source="spot">`.
- Old paths 301 at the edge and through `LocalizedRedirect` for `/:locale/` paths.
- Header and mobile nav: "Venues" becomes "Spots"; the "Organizations" link goes.

### Directory `/spots`

- Kind chips: All · Places · Organizations.
- Second row: existing venue categories plus Support · Advocacy · Shops · News outlets.
- The map shows `kind = 'place'` only. The list shows both.
- `/help` and `TestingSitesBand` use the same list hook filtered by `role = 'support'`.

### Detail page

Measured 2026-11-22: the "7 duplicated pairs" in `VenueDetail.parts.tsx` / `OrganizationDetail.parts.tsx`
are mostly NOT duplicates. Venue renders through `EntitySingle` (section titles from the descriptor),
org through `EntityDetailScroll` (each part prints its own h2); sidebars, meta builders (different SEO
rules and JSON-LD types), heroes, breadcrumbs and RunBy-vs-venue-grid differ on purpose. Only one was a
real copy: `OrgTags` hand-rolled `slice(0, 16)` badges instead of the shared `TagChipRow` (replaced).

So P4 does NOT build a merged `SpotDetail.parts.tsx`. It routes `/spots/:slug` to the existing venue
or org descriptor by `kind`. Optional later: a shared map inset (~15 lines each side) and `EntityAbout`
once org moves to `EntitySingle`.

### Components and hooks

- `SpotCard` replaces `VenueCard` and the inline `OrgCard`.
- `useSpots` (list, via `rpc_spots_ranked`, i.e. `rpc_venues_ranked` widened to both
  kinds) and `useSpot(slug)` (via `get_spot`). Old hooks stay as thin wrappers until P5.

### Admin

- `/admin/business` → `/admin/spots`: one directory with the same kind chips; the detail
  page keeps its per-role tabs.
- The CMS keeps two field editors (place profile, org profile) behind one "Spots" nav
  entry.
- The org link review queue stays; approving sets `parent_id`.

## 4. Error handling and testing

| Risk | Guard |
|---|---|
| Spine and profiles drift | Nightly `spots_drift_check()` → `spots_drift_log`; `check-pipeline-health.mjs` hard-fails on any row and reports `probe_ok` separately, so a broken probe never reads as 0. |
| Fold destroys data | Full jsonb snapshot plus repointed FK ids in `spot_fold_audit`; `unfold_spot(audit_id)` restores. |
| Fold postcondition lies | Assert the reached state (shadow count 0, 34 referencing rows resolve, roles and logos present on the venue), not rows updated. Dry-run the file's own `do $verify$` block on prod in a rolled-back transaction before merge. |
| Retired cron returns | Sentinel fails if `org_spine_backfill` reappears in `cron.job`. |
| Safety gate regresses | Golden set: every venue and org gated before P0 is still gated after P0 and P3. Anon e2e asserts a gated spot is invisible. |
| Duplicate search hits return | Sentinel: spots with more than one `search_documents` row = 0. |
| SEO loss on 301s | Crawler e2e: 50 old `/venues/:slug` and 20 shadow `/organizations/:slug` each give one 301, then 200 with canonical `/spots/:slug`. |

Tests:

- Unit (vitest): `/spots/:slug` picks the venue or org descriptor by kind, `SpotCard` for both kinds, chip
  filter state.
- Migration text-scan tests per phase, mutation-tested with a comment-only control.
- E2E: `/spots` list and map (no `kind = 'organization'` pins on the map); detail for
  place, chain, org and branch; redirects; anon safety gate.
- Verify on production after every phase.

## Out of scope

- Renaming `entity_type` strings in polymorphic tables.
- Merging the two CMS field editors.
- Claim portal (old business-spine Phase E).
