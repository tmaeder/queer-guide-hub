# Technical debt cleanup — candidates for human review, 2026-08-28

Scheduled autonomous cleanup pass. This is the **fifth** pass of this kind on this repo —
prior ones are [2026-06-10](2026-06-10-dead-code-audit.md),
[2026-07-31](2026-07-31-dead-code-audit-followup.md),
[2026-08-07](2026-08-07-dead-code-audit-followup.md), and
[2026-08-21](2026-08-21-tech-debt-cleanup.md). Per the requesting task, this document is for
**candidates only — nothing below was executed.** What *was* executed (low-risk, individually
verified) is in the PR/commit history for this branch, not here.

**Method:** fresh `npm install` at root and in `scraper/`; `npx knip` against the repo's own
`knip.jsonc` (already tuned against this repo's platform-invoked entry points, per its own
header comments); `npx depcheck` as a cross-check; a hand-written exact-duplicate-step scanner
over every `.github/workflows/*.yml` job (parses YAML, normalizes each step minus `name`, flags
any step body repeated within a job, and any job whose full step sequence is byte-identical to
another job's); manual `grep`/`rg` verification of every candidate before it went in either the
"executed" or "candidates" bucket; a live read-only `get_advisors(type=performance)` pull against
the production Supabase project for the DB section below (no writes).

## What was executed this pass (for context — details in the commit)

- Removed `postcss` from root `devDependencies`. This **overrides** the 2026-08-07 and
  2026-08-21 audits' explicit "keep" calls on the same finding, which is worth flagging even
  though it's not itself a candidate: both prior audits asserted postcss was "a peer of
  `@tailwindcss/vite`'s build pipeline" without checking `@tailwindcss/vite`'s own manifest. It
  doesn't depend on postcss at all (`@tailwindcss/oxide` + `@tailwindcss/node` only — Tailwind
  v4's Vite plugin bypasses PostCSS entirely), there is no `postcss.config.*` anywhere in the
  repo, and `vite.config.ts` never touches `css.postcss`. The only real consumer is `vite` itself,
  which already declares `postcss` as its own dependency, so `npm ls postcss` resolves it
  identically before and after this change — nothing stops being installed. Verified with a full
  `npm run build` (succeeds) plus the whole validation suite (lint/typecheck/typecheck:functions/
  build/9014 tests, all green) before committing. If this reasoning is wrong, it's a one-line
  revert.
- Everything else investigated this pass (see below) matched what the four prior audits already
  found and is listed here only where the underlying data changed since 2026-08-21 (the DB
  advisor section) or is new to this pass (the edge-function reference sweep).

## 1. Files / dependencies / dead code — reconfirms prior audits, nothing new

`knip` + `depcheck` findings were the same shape as every prior pass: `src/` remains at **zero**
flagged unused files. The only two repo-wide "unused files" knip reports
(`src/test/stubs/emptyWorkerUrl.ts`, `supabase/functions/_shared/profession-keywords.d.ts`) are
the same two false positives documented in the 2026-08-07 and 2026-08-21 audits (a Vite
`resolve.alias` target and a `.js`/`.d.ts` sibling-resolution pair, respectively, both invisible
to knip's static import graph) — re-verified by hand again this pass, still both load-bearing,
not touched.

`wrangler` (root devDependency) — the 2026-08-21 audit flagged this as "plausibly redundant, not
high-confidence enough, flagged for a human call." This pass found the deciding evidence: an
explicit comment in `.github/workflows/deploy-pages.yml` pinning `wranglerVersion: '4.124.0'` to
match this exact `package.json` entry, with the comment explaining that mismatch caused an
~80-minute production outage on 2026-08-06 (`npx` fell back to a registry lookup that failed).
**This settles it as a real dependency, not a candidate — do not remove.**

`prop-types` in `tools/person-db/package.json` — outside this pass's stated scope (root +
`scraper/` only) and already independently verified as a real transitive peer-dependency need
(`react-simple-maps` declares it as a `peerDependency`) in the 2026-08-21 audit. Not re-flagged.

**Unused exports (163) / unused exported types (96)** — knip's counts, almost entirely in
`supabase/functions/_shared/*.ts`, `scraper/`, `extension/`, `workers/*`, and `tools/person-db/`.
Per this task's explicit scope, dead-code removal only covers `src/`; of the full list, exactly
one item lives in `src/`: `makeQueryClient` in `src/test/test-utils.tsx` (used internally in the
same file, just not imported elsewhere — narrowing its export is a trivial, near-zero-value
change and was left alone rather than spending a diff on it). The rest are out of scope by the
task's own rules and match the same "public API surface for a documented shared/pure module"
pattern the 2026-08-07 and 2026-08-21 audits already investigated and declined to bulk-act on —
not re-litigated here.

## 2. Edge functions — swept for zero-reference candidates, nothing found

Not previously done in this exact shape by prior audits (which flagged `enrich-wolfram` as the
one concrete "possibly dead" candidate — see below). This pass grep-swept all 224
`supabase/functions/*` directory names against the whole repo (excluding each function's own
directory) for **any** literal-string reference — config, migrations, docs, other functions,
`src/`, `workers/`. First pass produced 5 apparent zero-reference names
(`feedback-retest-callback`, `marketplace-relevance-rescore`, `pipeline-enrich-country-editorial`,
`pipeline-enrich-country-stats`, `source-shopify-public`) — **all 5 turned out to be a tooling
artifact, not real orphans**: each is a longer sibling of a shorter function name that's also a
literal prefix of it (`feedback-retest-dispatch`/`-callback`, `pipeline-enrich-country` /
`-editorial` / `-stats`, `source-shopify` / `-public`), and the batched multi-pattern regex used
for speed matches the shorter prefix first and never separately records the longer one at the
same text position. Re-checked each of the 5 individually with a plain literal grep: all 5 are
referenced in `supabase/config.toml`, at least one migration or `_shared` module, and (for 3 of
them) `CLAUDE.md` itself. **Zero genuine zero-reference edge functions found this pass.**

Standing candidate from the 2026-08-07 audit, not re-verified independently this pass but still
worth carrying forward: `supabase/functions/enrich-wolfram/` (+ its `_shared/wolfram-client.ts`
dependency) is reachable code whose only known trigger, the `wf-enrich-wolfram-countries` cron,
is deliberately disabled per `CLAUDE.md`'s Country Completeness Engine section (superseded by
`pipeline-enrich-country-stats`, which now confirmed-references cleanly per §2 above). Whether the
function itself should be deleted, kept as a manual-trigger fallback, or left alone is a
product/ops call, not a grep-verifiable one — same conclusion as three weeks ago.

## 3. GitHub Actions workflows — no exact duplicates, nothing removed

35 workflow files now (was 36 as of 2026-08-21 — one fewer, not investigated further since it's a
net decrease and not a red flag). A structural scan (not just eyeballing) parsed every job in
every workflow and compared: (a) every step within a job against every other step in the *same*
job for byte-identical bodies (name excluded from comparison, so a re-labeled copy would still
be caught), and (b) every job's full step sequence against every other job's *in the same file*
for exact equality. **Zero matches on either check, across all 35 files.** Consistent with all
four prior audits — this repo does not have literal copy-paste CI duplication; where two
workflows look similar (e.g. `migration-drift-monitor.yml` vs. the push-triggered check in
`deploy-supabase-functions.yml`, both about migration drift, per `CLAUDE.md`'s own note on why
both exist), they're deliberately covering different trigger gaps, not redundant.

No run-history investigation was done this pass (the 2026-08-07 audit already did this and found
nothing currently red worth escalating); re-doing it wasn't judged to add new information without
a `gh`/GitHub-API session, which wasn't available in this environment.

## 4. Database — refreshed advisor data, two new items since 2026-08-21

Read-only `get_advisors(type=performance)` against the live production project
(`xqeacpakadqfxjxjcewc`), same category the 2026-08-21 audit used. **417 total lints**, dominated
by `unindexed_foreign_keys` (350) and `multiple_permissive_policies` (56) — both are
"add something" recommendations, not "orphaned, remove something" findings, so out of scope for
a dead-code sweep and not detailed further here. Restricting to the categories relevant to
*orphaned* objects (matching what the 2026-08-21 audit tabulated):

| Finding | Detail | Status vs. 2026-08-21 | Recommendation |
|---|---|---|---|
| `duplicate_index` | `public.tag_relations`' two byte-identical indexes | **Resolved** — no longer present in the advisor output. Someone already applied this between 08-21 and now. | None needed. |
| `unused_index` × 6 of the 8 previously listed (`hotels_closure_status_idx`, `queer_villages_closure_status_idx`, `geo_landmark_profiles_closure_status_idx`, `idx_milestone_quality_signals_mid`, `idx_milestone_quality_signals_created`, `idx_milestone_coverage_gaps_status`) | — | **No longer flagged** — either they've since been used (stats reflect real traffic) or the underlying tables/indexes changed. Not investigated further; a positive change either way. | None needed. |
| `unused_index` — `search_documents_geog_gix`, `user_presence_geog_gist` | Still flagged, same two as 2026-08-21. | Unchanged. | Same call as before: these back low-traffic-by-design features (PostGIS geo search, live presence), "never used since last stats reset" isn't the same as provably dead here. Left for a human with query-plan visibility. |
| `unused_index` — `idx_village_city_merge_audit_village` on `public.village_city_merge_audit` | **New this pass.** | New. | `village_city_merge_audit` is the audit trail for the 2026-08-24 queer-village merge work `CLAUDE.md` documents (`merge_village_into_city`) — a brand-new, low-write table from four days before this pull. "Never used" for an index on a table that new is expected, not a signal of dead code. **Not a real candidate**, flagging only for completeness against the prior audit's table shape. |
| `unused_index` — 3 findings on `n8n.*`/`umami.*` | Unchanged from 2026-08-21. | Unchanged. | Still out of scope — separate self-hosted tools sharing the instance, not the queer.guide application schema. |
| `no_primary_key` — `public.milestones_backup_20260721`, `public.person_gate_demoted_20260721` | Unchanged from 2026-08-21. | Unchanged. | Same call as before: dated backup/snapshot tables, no PK expected. Likely safe to drop once whatever incident they're rollback material for is confirmed closed, but that's a judgment call belonging to whoever created them. |
| `no_primary_key` — `public.unified_tag_assignments_backup_20260916` | **New this pass.** | New. | Traced to `supabase/migrations/20260916111000_tag_dead_assignment_sweep.sql`, which creates it explicitly as a pre-sweep snapshot (`create table ... as select ...`, RLS enabled, `revoke all ... from anon, authenticated`) before a tag-assignment cleanup — the exact same deliberate-rollback-table pattern as the two above, not an accident. Same recommendation: keep until the sweep it backs is confirmed safe to consider final, then a human call on retention. |
| `table_bloat` — `public.admin_automations` | Unchanged from 2026-08-21. | Unchanged. | Not a deletion candidate — `VACUUM FULL`/autovacuum tuning, out of scope for a code-level cleanup pass. |

No SQL was executed, no migration files were written or edited, no tables/columns/indexes were
dropped or altered. All of the above came from a single read-only advisor call.

## 5. What would need to happen before any of the above could move from "candidate" to "safe to execute"

Repeating the standing rule from every prior audit, since it still applies unchanged: this
codebase's own `CLAUDE.md` documents multiple specific, costly incidents where a clean-looking
"unused" or "orphaned" signal (a retired cron that silently un-retired itself via a reconciler
pass, a city-matching check that read as safe only because the reference table couldn't represent
the ambiguity it needed to catch, an index/column that looked dead by static analysis but was
read by a pg_cron job or a Worker with no source-level reference) turned out to be wrong. Nothing
in §2–4 above was executed for that reason. Before any human turns one of these into a real
change: for the edge function, check `admin_automations` and live `cron.job` state, not just
source references; for the DB indexes/tables, check actual recent query-plan usage and confirm
the incident/sweep each backup table exists for is closed, not just that the table's name is old.

## Changelog (this branch)

**Changed:**
- `package.json` / `package-lock.json` — removed `postcss` (`^8.5.26`) from root
  `devDependencies`. Not directly used anywhere in the repo (no config file, no import); already
  supplied transitively as `vite`'s own dependency, so nothing stops being installed. See "What
  was executed" above for the full verification against the two prior audits that kept it.

**Deleted:** no files, no other dependencies, no CI steps, no DB objects.

**Verification:** `npm run lint` (0 errors, 15 pre-existing warnings unrelated to this change),
`npm run typecheck` (837 baseline errors, 0 new), `npm run typecheck:functions` (0 errors),
`npm run build` (succeeds), `npm test` (1210 test files, 9014 tests, all passing) — all re-run
clean against the final state of this branch.
