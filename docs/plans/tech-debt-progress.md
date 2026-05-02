# Tech debt progress — 2026-05-01 cleanup pass

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

| ID | Title | Status | PR / Note |
|---|---|---|---|
| LINT-1 | `no-explicit-any` → error | ⏭️ No-op | Already at `error` in eslint.config.js |
| DUP-1 | CMS hooks consolidation | ✅ Shipped | [#257](https://github.com/tmaeder/queer-guide-hub/pull/257) — `useCMS` had zero consumers; deleted |
| LINT-2 | tsconfig strict mode | ✅ Shipped | [#266](https://github.com/tmaeder/queer-guide-hub/pull/266) — 0 errors after flip |
| ARCH-1 | EntityDetailLayout + useEntityDetail | ✅ Foundation | [#271](https://github.com/tmaeder/queer-guide-hub/pull/271) — layout + hook + tests; per-page migrations are follow-ups |
| DUP-4 | supabase.from() out of pages → hooks | 🟡 Surface | [#277](https://github.com/tmaeder/queer-guide-hub/pull/277) — custom ESLint rule at warn level (268 warnings to address) |
| DUP-3 | Admin pages → useAdminTableQuery | ✅ Foundation | [#273](https://github.com/tmaeder/queer-guide-hub/pull/273) — AdminEntityTable shell + AdminTags proof; per-page migrations are follow-ups |
| ARCH-4 | UserDirectory split | ✅ Shipped | [#260](https://github.com/tmaeder/queer-guide-hub/pull/260) |
| ARCH-5 | ContentListPanel structural split | ✅ Shipped | [#275](https://github.com/tmaeder/queer-guide-hub/pull/275) — directory split; useAdminTableQuery migration is a follow-up |
| ARCH-7 | AdminFeedback split | ✅ Shipped | [#259](https://github.com/tmaeder/queer-guide-hub/pull/259) |
| ARCH-8 | Hook hygiene pass | ⏭️ No-op | Audit found ≤3 candidates, codebase already pruned |
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
| DB-1 | Squash 645 migrations into baseline | 🅱️ Designed, not scheduled | [#276](https://github.com/tmaeder/queer-guide-hub/pull/276) — design doc captures preconditions, risks, alternatives |

## Summary

- **PRs shipped this session:** 24 (#246 through #277, plus this dashboard PR)
- **Register items addressed:** 27 / 27
  - Code shipped: 21
  - No-ops (already done in codebase): 3 — BUILD-4, LINT-1, ARCH-8
  - Design docs (deferred-to-operator): 3 — ARCH-3 step 5 ([#270](https://github.com/tmaeder/queer-guide-hub/pull/270)), DB-1 ([#276](https://github.com/tmaeder/queer-guide-hub/pull/276)), TEST-1 spec triage (waits on nightly run)

## Per-page follow-ups (incremental work)

These are mechanical follow-ups that fall out naturally as feature work touches each page. Each is a small PR; none are blocking.

- **ARCH-1 page migrations** — VenueDetail, CityDetail, CountryDetail, EventDetail, PersonalityDetail, QueerVillageDetail, HotelDetail, MarketplaceItemDetail. Each migrates onto `EntityDetailLayout` + `useEntityDetail`. Foundation in [#271](https://github.com/tmaeder/queer-guide-hub/pull/271).
- **DUP-3 page migrations** — AdminVenueServices, AdminVenueAmenities, AdminEventServices, AdminEventAmenities, AdminCities, AdminCountries, AdminPersonalities, AdminQueerVillages, AdminHotels, AdminGroups, AdminVenues, AdminEvents, AdminMarketplace, AdminNewsSources. Each migrates onto `AdminEntityTable`. Foundation in [#273](https://github.com/tmaeder/queer-guide-hub/pull/273).
- **DUP-4 warning cleanup** — 268 ESLint warnings; clear them by moving `supabase.from()` into hooks. Most disappear when the page lands on ARCH-1 or DUP-3. Promote rule to `error` once the count is zero.
- **ARCH-5 useAdminTableQuery migration** — ContentListPanel was structurally split in [#275](https://github.com/tmaeder/queer-guide-hub/pull/275); the semantic migration onto `useAdminTableQuery` is a separate follow-up.

## Operator follow-ups

- Run `supabase functions deploy --prune` to actually remove the deleted `fetch-news` edge function from the project.
- Set CI repo secrets `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` so the nightly e2e workflow can authenticate.
- Apply the `news_articles` writer-guard migration ([#270](https://github.com/tmaeder/queer-guide-hub/pull/270) Phase A) when ready; watch logs for 24-72 h; then apply Phase B.
- After first nightly e2e run: triage failures, mark broken specs `test.skip` with tracking issues, delete irrelevant specs.
