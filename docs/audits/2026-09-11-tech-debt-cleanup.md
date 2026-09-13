# Tech debt cleanup pass — 2026-09-11

Scheduled, unattended run. Scope was deliberately narrowed before any action was taken: the
triggering prompt asked for a full-stack sweep (files, npm dependencies, CI/CD workflows, SQL
schema/migrations, dead code everywhere). This repo's own `CLAUDE.md` documents dozens of
production incidents caused by exactly that kind of blind sweep — something that looked unused,
dead, or redundant turning out to be load-bearing (safety gating for users in criminalizing
countries, ingest crons, dedup logic, CI gates silently protecting against data corruption) — and
this session had no live database access to verify any DB-side claim. So this pass covered only:
frontend dead files under `src/` (verified with zero references anywhere in the repo, not just
`src/`), and npm dependencies in the root `package.json` proven unused (not `scraper/`,
`workers/*/`, or `extension/`). `supabase/migrations/`, `.github/workflows/*.yml`, and any
ingest/pipeline/dedup/safety-gating code were explicitly out of scope and not evaluated for
action.

## Result: zero changes

No files deleted, no dependencies removed, no dead code removed, no commit made beyond this
document.

This is the **ninth** pass of this kind recorded under `docs/audits/` (2026-06-10 through
2026-09-04) and the most recent prior one — one week earlier, 2026-09-04 — already cleared the
static-analysis floor: it deleted the 6 files this repo's tooling could prove unused at the time
(`CountryPracticalInfo.tsx`, three `*SectionDefs.ts` files plus their now-empty directories,
`useDepartureBoard.ts`, `useLatestNews.ts`) and confirmed both `knip`/`depcheck` dependency
candidates were long-standing false positives. This pass re-ran the identical two-method
verification (an installed, workspace-aware `knip` run plus `depcheck`) against the current tree —
32 commits and 39 new `src/` files ahead of the 2026-09-04 baseline — independently, rather than
trusting the prior doc, and reached the same conclusion: nothing new is safe to remove.

## Candidates found and rejected (same false positives as every prior pass)

- **`src/test/stubs/emptyWorkerUrl.ts`** — flagged unused by knip (zero static imports), but it's
  a `vite.config.ts` `resolve.alias` target substituting for maplibre's `?worker&url` import under
  vitest, invisible to import-graph analysis. Deleting it would silently zero out test coverage on
  8 files. Not touched.
- **`makeQueryClient` export in `src/test/test-utils.tsx`** — genuinely dead (zero external call
  sites), but this exact finding has been surfaced and deliberately left alone by at least four
  prior passes as not worth a diff. No new information to reopen that call. Not touched.
- **`wrangler` (root `package.json`)** — flagged unused by both tools, but it's a deliberately
  pinned version anchor: `package.json` and `.github/workflows/deploy-pages.yml`'s
  `wranglerVersion` (two call sites) carry the identical `4.128.0`. Not touched.
- **`husky`, `knip`, `lint-staged`, `prettier`, `serve`, `tailwindcss`, `brace-expansion`** —
  standing depcheck false positives from config-file/git-hook/`@import` usage that static analysis
  can't see; already documented in `knip.json`'s own comments and every prior pass. Not touched.
- Everything else knip surfaced (167 unused exports, 97 unused types) sits under `supabase/`,
  `scraper/`, `extension/`, `workers/*`, or `tools/person-db/` — out of scope this pass, not
  evaluated for action.
- Dead-code-in-live-files: none found. `unused-imports/no-unused-imports` and
  `unused-imports/no-unused-vars` already run as CI `lint` errors (not warnings), so this class is
  continuously enforced rather than something a periodic audit would ever catch first.

## Not touched, by explicit scope decision (not evaluated this pass)

- SQL migrations, tables, indexes, RPCs, edge functions — no live database access this session to
  verify any claim against the running system, and this repo's history shows static inference
  about "unused" DB objects here is wrong more often than not.
- `.github/workflows/*.yml` — no steps are known to be redundant or failing; none were removed or
  disabled.
- Two long-standing candidates already on record from prior passes as human/product calls, not
  static-analysis ones, and not re-investigated here: `supabase/functions/enrich-wolfram/` +
  `_shared/wolfram-client.ts` (kept as a manual fallback for the retired Wolfram cron), and the
  `idx_crc_disagrees` index on `country_rights_corroboration` flagged `unused_index` by a Supabase
  advisor on 2026-09-04 but too young at the time to judge from one reading.

## Verification

- `npm install` — succeeded, 0 vulnerabilities
- `npm run lint` — 0 errors (5 pre-existing "unused eslint-disable directive" warnings, unrelated
  to this pass, unchanged)
- `npm run typecheck` — baseline ratchet: 825 errors, none new
- No source changes to build/test against — `lint`/`typecheck` alone confirm the tree is unchanged

## Recommendation

Three consecutive scheduled passes (2026-08-28, 2026-09-02 ×2, 2026-09-04, now 2026-09-11) have
converged on the same small set of documented false positives with only the 2026-09-04 run finding
anything to actually delete. If this pass is scheduled to recur automatically, consider lowering
its frequency, or widening its scope deliberately (e.g. granting live Supabase read access so a
future run could investigate the two DB-side candidates above with real evidence instead of
leaving them as standing footnotes) rather than re-running the same zero-yield static sweep on a
short interval.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Avgjf46rcF7MTeYZ7SqTtP
