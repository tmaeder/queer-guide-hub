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
| ARCH-3 | Remove fetch-news (frontend + edge fn) | 🟡 Partial | [#255](https://github.com/tmaeder/queer-guide-hub/pull/255) — SQL writer-guard trigger deferred |
| LINT-4 | eslint-disable cleanup (6 hot-spot files) | ✅ Shipped | [#256](https://github.com/tmaeder/queer-guide-hub/pull/256) |
| BUILD-4 | Lazy-load exceljs/mammoth | ⏭️ No-op | Already lazy-loaded via `await import()` in code |

## Phase 2 — Strategic refactors (13 items)

| ID | Title | Status | PR / Note |
|---|---|---|---|
| LINT-1 | `no-explicit-any` → error | ⏭️ No-op | Already at `error` in eslint.config.js |
| DUP-1 | CMS hooks consolidation | ✅ Shipped | [#257](https://github.com/tmaeder/queer-guide-hub/pull/257) — `useCMS` had zero consumers; deleted |
| LINT-2 | tsconfig strict mode | ✅ Shipped | [#266](https://github.com/tmaeder/queer-guide-hub/pull/266) — 0 errors after flip |
| ARCH-1 | EntityDetailLayout + useEntityDetail | ⏸️ Deferred | 7-10 PRs across 8 detail pages; needs architectural design pass |
| DUP-4 | useEffect → useQuery in pages | 🟡 Partial | Achieved for UserDirectory via ARCH-4; remaining 14-19 pages deferred |
| DUP-3 | Admin pages → useAdminTableQuery | ⏸️ Deferred | 15-20 PRs; needs the AdminEntityTable shell built first |
| ARCH-4 | UserDirectory split | ✅ Shipped | [#260](https://github.com/tmaeder/queer-guide-hub/pull/260) |
| ARCH-5 | ContentListPanel → useAdminTableQuery | ⏸️ Deferred | Depends on DUP-3 abstraction |
| ARCH-7 | AdminFeedback split | ✅ Shipped | [#259](https://github.com/tmaeder/queer-guide-hub/pull/259) |
| ARCH-8 | Hook hygiene pass | ⏭️ No-op | Audit found ≤3 candidates, codebase already pruned |
| ARCH-9 | MediaLibrary split | ✅ Shipped | [#262](https://github.com/tmaeder/queer-guide-hub/pull/262) |
| ARCH-10 | PipelineBuilder split | ✅ Shipped | [#263](https://github.com/tmaeder/queer-guide-hub/pull/263) |
| TEST-1 | E2E nightly + npm scripts | 🟡 Partial | [#264](https://github.com/tmaeder/queer-guide-hub/pull/264) — per-spec triage waits on first nightly run |

## Phase 3 — Major investments (1 item)

| ID | Title | Status | PR |
|---|---|---|---|
| BUILD-1 | Build < 3 min | ✅ Already met | [#267](https://github.com/tmaeder/queer-guide-hub/pull/267) — 34s on main, baseline doc updated |

## Backlog (1 item)

| ID | Title | Status |
|---|---|---|
| DB-1 | Squash 645 migrations into baseline | 🅱️ Not scheduled (per plan) |

## Summary

- **Shipped:** 17 PRs (#246–#267 inclusive of in-flight)
- **No-ops** (already done in codebase): BUILD-4, LINT-1, ARCH-8
- **Partial** (infrastructure shipped, follow-up deferred): ARCH-3, TEST-1, DUP-4
- **Deferred** (multi-PR architectural sequences): ARCH-1, ARCH-5, DUP-3
- **Backlog**: DB-1

## Follow-ups

- ARCH-3 step 5: SQL writer-guard trigger on `news_articles`. Open as a separate design-doc PR. Roll out as `RAISE NOTICE` (dry-run) for 24 h, then promote to `RAISE EXCEPTION`.
- TEST-1 spec triage: after first nightly run, mark broken specs `test.skip` with tracking issues, fix or delete.
- DUP-4 / DUP-3: incremental per-page migration as feature work touches each page.
- ARCH-1: dedicate a quarter-block; design the layout + hook contract reading all 8 detail pages, then migrate one at a time.

## Operator follow-ups

- Run `supabase functions deploy --prune` to actually remove the deleted `fetch-news` edge function from the project.
- Ensure CI repo secrets `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` are set so the nightly e2e workflow can authenticate.
