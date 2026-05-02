# Tech debt progress — 2026-05-01 → 2026-05-02 cleanup pass

Source register: `docs/tech-debt-register-2026-05.xlsx` (27 items)
Source plan: `~/.claude/plans/tech-debt-remediation-frolicking-dijkstra.md`

## Phase 1 — Quick wins (12 items)

| ID | Title | Status | PR |
|---|---|---|---|
| DOC-1 | CLAUDE.md refresh + drift CI | ✅ Shipped | [#246](https://github.com/tmaeder/queer-guide-hub/pull/246) |
| ARCH-2 | contentTypeRegistry split | ✅ Shipped | [#247](https://github.com/tmaeder/queer-guide-hub/pull/247) |
| BUILD-2 | supabase types as `import type` | ✅ Shipped | [#248](https://github.com/tmaeder/queer-guide-hub/pull/248) |
| LINT-3 | unused-imports → error | ✅ Shipped | [#249](https://github.com/tmaeder/queer-guide-hub/pull/249) |
| DUP-2 | edge-function CORS centralised | ✅ Shipped | [#250](https://github.com/tmaeder/queer-guide-hub/pull/250) |
| BUILD-5 | drop `--legacy-peer-deps` | ✅ Shipped | [#251](https://github.com/tmaeder/queer-guide-hub/pull/251) |
| BUILD-3 | bundle-shape script + CI | ✅ Shipped | [#252](https://github.com/tmaeder/queer-guide-hub/pull/252) |
| ARCH-6 | App.tsx → routes/providers/layout | ✅ Shipped | [#253](https://github.com/tmaeder/queer-guide-hub/pull/253) |
| ARCH-11 | PatternLibrary patterns.tsx split | ✅ Shipped | [#254](https://github.com/tmaeder/queer-guide-hub/pull/254) |
| ARCH-3 | Remove fetch-news + writer-guard design | ✅ Shipped | code [#255](https://github.com/tmaeder/queer-guide-hub/pull/255) + design [#270](https://github.com/tmaeder/queer-guide-hub/pull/270) |
| LINT-4 | eslint-disable cleanup (6 hot-spot files) | ✅ Shipped | [#256](https://github.com/tmaeder/queer-guide-hub/pull/256) |
| BUILD-4 | Lazy-load exceljs/mammoth | ⏭️ No-op | Already lazy-loaded via `await import()` in code |

## Phase 2 — Strategic refactors (13 items)

| ID | Title | Status | PRs |
|---|---|---|---|
| LINT-1 | `no-explicit-any` → error | ⏭️ No-op | Already at `error` |
| DUP-1 | CMS hooks consolidation | ✅ Shipped | [#257](https://github.com/tmaeder/queer-guide-hub/pull/257) |
| LINT-2 | tsconfig strict mode | ✅ Shipped | [#266](https://github.com/tmaeder/queer-guide-hub/pull/266) |
| ARCH-1 | EntityDetailLayout + useEntityDetail | ✅ Foundation + 8/8 pages | foundation [#271](https://github.com/tmaeder/queer-guide-hub/pull/271) · Hotel [#280](https://github.com/tmaeder/queer-guide-hub/pull/280) · Village/Personality [#283](https://github.com/tmaeder/queer-guide-hub/pull/283) · Event/Marketplace [#284](https://github.com/tmaeder/queer-guide-hub/pull/284) · Venue [#285](https://github.com/tmaeder/queer-guide-hub/pull/285) · City/Country [#286](https://github.com/tmaeder/queer-guide-hub/pull/286) |
| DUP-4 | supabase.from() out of pages → hooks | ✅ Rule + cleanup | rule [#277](https://github.com/tmaeder/queer-guide-hub/pull/277); warning count significantly reduced as side-effect of ARCH-1 / ARCH-4 / DUP-3 migrations |
| DUP-3 | Admin pages → AdminEntityTable | ✅ Foundation + 17 pages | foundation [#273](https://github.com/tmaeder/queer-guide-hub/pull/273) · 4 attribute pages [#279](https://github.com/tmaeder/queer-guide-hub/pull/279) · 4 lookup pages [#281](https://github.com/tmaeder/queer-guide-hub/pull/281) · 4 mid-tier [#282](https://github.com/tmaeder/queer-guide-hub/pull/282) · Personality+Village admin [#287](https://github.com/tmaeder/queer-guide-hub/pull/287) · 4 large entity pages [#288](https://github.com/tmaeder/queer-guide-hub/pull/288) · Users [#289](https://github.com/tmaeder/queer-guide-hub/pull/289) |
| ARCH-4 | UserDirectory split | ✅ Shipped | [#260](https://github.com/tmaeder/queer-guide-hub/pull/260) |
| ARCH-5 | ContentListPanel structural split | ✅ Shipped | [#275](https://github.com/tmaeder/queer-guide-hub/pull/275) — directory split; semantic migration onto useAdminTableQuery is a follow-up |
| ARCH-7 | AdminFeedback split | ✅ Shipped | [#259](https://github.com/tmaeder/queer-guide-hub/pull/259) |
| ARCH-8 | Hook hygiene pass | ⏭️ No-op | Audit found ≤3 candidates, already pruned |
| ARCH-9 | MediaLibrary split | ✅ Shipped | [#262](https://github.com/tmaeder/queer-guide-hub/pull/262) |
| ARCH-10 | PipelineBuilder split | ✅ Shipped | [#263](https://github.com/tmaeder/queer-guide-hub/pull/263) |
| TEST-1 | E2E nightly + npm scripts | 🟡 Infra | [#264](https://github.com/tmaeder/queer-guide-hub/pull/264) — per-spec triage waits on first nightly run |

## Phase 3 — Major investments (1 item)

| ID | Title | Status | PR |
|---|---|---|---|
| BUILD-1 | Build < 3 min | ✅ Already met | [#267](https://github.com/tmaeder/queer-guide-hub/pull/267) — 34s on main, baseline doc updated |

## Backlog (1 item)

| ID | Title | Status | PR |
|---|---|---|---|
| DB-1 | Squash 645 migrations into baseline | 🅱️ Designed, not scheduled | [#276](https://github.com/tmaeder/queer-guide-hub/pull/276) |

## Summary

- **PRs shipped this two-day pass:** 33 (#246 → #289 + dashboard PRs)
- **Register items addressed:** 27 / 27
  - Code shipped: 21
  - No-ops (already done): 3 — BUILD-4, LINT-1, ARCH-8
  - Design docs: 3 — ARCH-3 step 5, DB-1, TEST-1 spec triage waits on nightly run

### ARCH-1 — All 8 detail pages migrated

Hotel, QueerVillage, Personality, Event, Marketplace, Venue, City, Country. Each kept its slug-or-id fallback / NotFound handling / page-view tracking / page-specific side-effects in the page; hero/tab/sidebar markup moved into co-located `*.parts.tsx` files. Foundation gaps (no NotFound slot, no error callback, no extra-filter composition) are signals for a future iteration.

### DUP-3 — 17 admin pages on AdminEntityTable

AdminTags (canonical), AdminVenueServices/Amenities, AdminEventServices/Amenities, AdminEventTypes, AdminTargetGroups, AdminVenueCategories, AdminAccessibilityAttributes, AdminGroups, AdminCountries, AdminCities, AdminHotels, AdminPersonalities, AdminQueerVillages, AdminVenues, AdminEvents, AdminMarketplace, AdminNewsSources, AdminUsers. Skipped: AdminIngestionRules + AdminReview (custom non-table UIs; not a fit).

### Outstanding — small surface, scheduled differently

- **ARCH-5 semantic migration** — the structural split shipped in [#275](https://github.com/tmaeder/queer-guide-hub/pull/275); the migration onto `useAdminTableQuery` is a separate refactor, not blocked by anything.
- **TEST-1 spec triage** — needs the first nightly run output before specs can be marked broken/skipped/deleted.
- **DUP-4 remaining warnings** — the rule shipped at warn level; per-page migrations onto ARCH-1 / DUP-3 / ARCH-4 reduced the count substantially. Promote to `error` once the count is zero. The remaining warnings are mostly in components that wrap CRUD mutations (these are appropriate for a hook in many cases but not always).

## Operator follow-ups

- Run `supabase functions deploy --prune` to remove the deleted `fetch-news` edge function from the project.
- Set CI repo secrets `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` so the nightly e2e workflow can authenticate.
- Apply the `news_articles` writer-guard migration ([#270](https://github.com/tmaeder/queer-guide-hub/pull/270) Phase A) when ready; watch logs for 24-72 h; then apply Phase B.
- After first nightly e2e run: triage failures.
