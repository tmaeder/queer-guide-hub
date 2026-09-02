# Technical debt cleanup — sixth pass, 2026-09-02

Scheduled autonomous cleanup pass. This is the **sixth** pass of this kind on this repo — prior
ones are [2026-06-10](2026-06-10-dead-code-audit.md),
[2026-07-31](2026-07-31-dead-code-audit-followup.md),
[2026-08-07](2026-08-07-dead-code-audit-followup.md),
[2026-08-21](2026-08-21-tech-debt-cleanup.md), and
[2026-08-28](2026-08-28-tech-debt-candidates.md) (the most recent, PR #3063 — one dependency
removed, everything else reconfirmed or non-actionable).

Since 2026-08-28 `main` moved forward by hundreds of commits (a Pride-programme feature, the
NVIDIA LLM provider chain, itinerary/day-level trip generation, several city/tag data-quality
sweeps, archivable leaf entities, etc.). This pass re-ran the full methodology against that new
state rather than assuming the prior findings still hold.

**Method:** fresh `npm install` at root, `scraper/`, and (newly, to remove a knip config-load
error the prior five passes didn't hit) `extension/`; `npx knip` against the repo's own
`knip.jsonc`; `npx depcheck` at root and in `scraper/` as a cross-check; a hand-written
exact-duplicate-CI-step scanner (parses every `.github/workflows/*.yml` job, normalizes each step
minus `name`, flags any step body repeated within a job and any job whose full step sequence is a
byte-identical match or prefix-subset of another job's in the same file); a per-function literal
grep sweep of all 226 `supabase/functions/*` names against the whole repo (one `grep -rl` per
name, function's own directory excluded — deliberately not the prior passes' batched
multi-pattern regex, which the 2026-08-28 audit found produces false positives on
prefix-collision names); a live read-only `get_advisors(type=performance)` pull against the
production Supabase project.

## Result: nothing new to execute this pass

Every check reconfirmed the 2026-08-28 audit's findings on the current `main`. **No files were
deleted, no dependencies were removed, no dead code was removed, no CI steps were removed.** This
is treated as a legitimate outcome, not a shortfall — five prior passes (the most recent finding
exactly one candidate, a devDependency) had already brought this repo close to a static-analysis
floor, and a large volume of new commits landing clean confirms the codebase is staying that way
rather than regressing.

### 1. Files / dependencies / dead code in `src/` — zero, same as every prior pass

`knip` reports **zero** unused files in `src/`. The two repo-wide "unused files" it still reports
(`src/test/stubs/emptyWorkerUrl.ts`, `supabase/functions/_shared/profession-keywords.d.ts`) are
the same two documented false positives from the 2026-08-07 audit onward (a Vite `resolve.alias`
target and a `.js`/`.d.ts` sibling-resolution pair, both invisible to knip's import graph) —
re-verified by hand again, still both load-bearing, not touched.

Root `Unused dependencies`/`Unused devDependencies`: only `prop-types` (in
`tools/person-db/package.json`, out of this task's stated scope, and already independently
confirmed as a real `react-simple-maps` peer-dependency need) and `wrangler` (root
devDependency) — the latter settled definitively by the 2026-08-28 audit as a deliberate version
pin matched against `deploy-pages.yml`'s `wranglerVersion`, after an ~80-minute production outage
on 2026-08-06 caused by a version mismatch. Re-checked this pass: the pin is still live and still
kept in lockstep — `wranglerVersion: '4.127.0'` in `.github/workflows/deploy-pages.yml` matches
`package.json`'s `"wrangler": "4.127.0"` exactly, both bumped together by the 2026-09-01
`chore(deps): bump the npm group with 34 updates` PR (#3252). Confirms this is an actively
maintained pin, not stale — **do not remove.**

`depcheck` (root and `scraper/`) reported nothing beyond the same known false positives already
documented (tooling-config-only deps like `husky`/`lint-staged`/`prettier`/`tailwindcss` that
depcheck can't see are used via hooks/config rather than JS imports; `brace-expansion`
deliberately unimported per `knip.jsonc`'s own comment to anchor an `overrides` security pin).
`scraper/` `depcheck` came back completely clean (`No depcheck issue`).

**Unused exports/types**: knip's full-repo counts (165 exports / 99 types) are almost entirely in
`supabase/functions/_shared/*.ts`, `scraper/`, `extension/`, `workers/*`, and `tools/person-db/` —
out of this task's `src/`-only scope for dead-code removal. Filtered to `src/` specifically:
**exactly one item**, `makeQueryClient` in `src/test/test-utils.tsx` (used internally in the same
file, just not imported elsewhere) — identical to the 2026-08-28 finding, left alone again for the
same reason (a near-zero-value change not worth a diff).

### 2. Edge functions — re-swept with a stricter method, zero genuine orphans

The 2026-08-28 audit's batched-regex sweep had a documented false-positive class (a longer
function name that's a literal suffix-extension of a shorter one gets swallowed by the shorter
match at the same text position, e.g. `pipeline-enrich-country` / `-editorial` / `-stats`). This
pass swept differently: **one individual `grep -rl` per function name** (226 names, each function's
own directory excluded), which cannot have that failure mode. Result: **zero names with no
reference anywhere in the repo.** Every one of the 226 non-`_`-prefixed `supabase/functions/*`
directories is referenced somewhere outside its own directory (config, migrations, another
function, `src/`, `workers/`, or docs).

Standing candidate carried forward unchanged: `supabase/functions/enrich-wolfram/` (+
`_shared/wolfram-client.ts`). Re-checked this pass — `wf-enrich-wolfram-countries` is still the
disabled/retired cron per `20260813100000_retire_wolfram_cron_registry_row.sql`, and a later
migration (`20261029094600_source_aids_ch_cron.sql`) even references that retirement in a comment
as settled precedent for how to retire a cron correctly. Nothing changed here since 2026-08-07 —
same conclusion: whether to delete the function, keep it as a manual fallback, or leave it is a
product/ops call, not something a grep sweep can resolve.

### 3. GitHub Actions workflows — no exact duplicates, nothing removed

36 workflow files (was 35 as of 2026-08-28 — no red flag, the repo added workflows for the new
features that landed since, e.g. items visible in `git log --diff-filter=A -- .github/workflows`).
The structural scanner (every step within a job compared for byte-identical bodies with `name`
excluded; every job's full step sequence compared against every other job's in the same file for
exact equality or prefix-subset) found **zero matches across all 36 files** — same result as every
prior pass. This repo does not have literal copy-paste CI duplication.

### 4. Database — refreshed advisor data, two new low-write audit-table indexes, nothing else changed

Read-only `get_advisors(type=performance)` against the live production project
(`xqeacpakadqfxjxjcewc`). **419 total lints** (was 417 on 2026-08-28), same dominant shape
(350 `unindexed_foreign_keys`, 56 `multiple_permissive_policies` — both "add something"
recommendations, out of scope for a dead-code sweep). Restricting to categories relevant to
*orphaned* objects:

| Finding | Detail | Status vs. 2026-08-28 | Recommendation |
|---|---|---|---|
| `duplicate_index` | — | **Still resolved** — no `duplicate_index` lint present at all (0 rows with that name in the advisor output). | None needed. |
| `unused_index` — `search_documents_geog_gix`, `user_presence_geog_gist` | Still flagged, same two carried since 2026-08-21. | Unchanged. | Same call as every prior pass: low-traffic-by-design features (PostGIS geo search, live presence). Left for a human with query-plan visibility. |
| `unused_index` — `idx_village_city_merge_audit_village` | Still flagged, same as 2026-08-28. | Unchanged. | Same call: brand-new low-write audit table backing the 2026-08-24 queer-village merge work — "never used" on a young audit-only table is expected, not a signal. |
| `unused_index` — `idx_nonplace_city_deletion_audit_city` on `public.nonplace_city_deletion_audit` | **New this pass.** | New. | Same pattern as the village one above: traced to `20261001120000_delete_nonplace_city_shells.sql`, the one-shot audit table for the "personality-birth-place non-place city shells" deletion `CLAUDE.md` documents (57 rows deleted, first hard DELETE on `cities` in repo history — the audit table is its only way back). A one-shot historical audit table naturally sees near-zero query traffic after its initial write. **Not a real candidate.** |
| `unused_index` — `idx_community_groups_archived_at` on `public.community_groups` | **New this pass.** | New. | Traced to `20261029100000_archivable_leaf_entities.sql`, a partial index (`WHERE archived_at IS NOT NULL`) added when hotels/news_articles/community_groups gained an archived state — very recent, and a partial index on a state most rows don't carry yet is expected to show little traffic early. **Not a real candidate**, same reasoning as the two audit-table indexes above. |
| `unused_index` — 4 findings on `n8n.*`/`umami.*` (`executions_workflow_id_idx`, `workflow_statistics_workflow_id_idx`, `workflow_tags_tag_id_idx`, `website_user_id_idx`) | Was 3 on 2026-08-28 (one more `n8n`/`umami` index now flagged). | Slightly grown, still out of scope. | Unchanged call: these are separate self-hosted tools (n8n, umami) sharing the Postgres instance, not the queer.guide application schema — not this repo's dead code to remove. |
| `no_primary_key` — `public.milestones_backup_20260721`, `public.person_gate_demoted_20260721` | Unchanged. | Unchanged. | Same call as every prior pass: dated backup/snapshot tables, no PK expected, retention is a human judgment call tied to whichever incident they back. |
| `no_primary_key` — `public.unified_tag_assignments_backup_20260916` | Unchanged from 2026-08-28. | Unchanged. | Same call: deliberate pre-sweep snapshot table (`20260916111000_tag_dead_assignment_sweep.sql`), RLS-enabled, `revoke all` from anon/authenticated — keep until the sweep it backs is confirmed final. |
| `table_bloat` — `public.admin_automations` | Unchanged. | Unchanged. | Not a deletion candidate — vacuum/autovacuum tuning, out of scope for a code-level cleanup pass. |

No SQL was executed, no migration files were written or edited, no tables/columns/indexes were
dropped or altered. All of the above came from a single read-only advisor call.

## 5. What would need to happen before any of the above could move from "candidate" to "safe to execute"

Unchanged from every prior audit, repeated because it still applies: this codebase's own
`CLAUDE.md` documents many specific, costly incidents where a clean-looking "unused" or "orphaned"
signal turned out to be wrong (a retired cron that silently un-retired itself via a reconciler
pass, a "0 ambiguous matches" city-collision test that was evidence the reference table *couldn't
express* the ambiguity rather than evidence of safety, an index that looked dead by static
analysis but was read by a pg_cron job or a Worker with no source-level reference). Nothing in
§2–4 above was executed for that reason. Before any human turns one of these into a real change:
for the edge function, check `admin_automations` and live `cron.job` state, not just source
references; for the DB indexes/tables, check actual recent query-plan usage over a real traffic
window and confirm the incident/sweep each backup table exists for is closed, not just that the
table's name is old.

## Changelog (this branch)

**Changed:** nothing.

**Deleted:** no files, no dependencies, no dead code, no CI steps, no DB objects.

**Added:** this audit document only.

**Verification** (all re-run clean against the final state of this branch, which is `main` plus
only this document):
- `npm run lint` — 0 errors, 36 pre-existing warnings unrelated to this pass (fast-refresh /
  unused-eslint-disable / no-explicit-any / no-useless-assignment, all in files this pass never
  touched)
- `npm run typecheck` — 832 baseline errors present, 0 new (baseline recorded 834; 2 have already
  been fixed by other work merged to `main` since the baseline was last locked — not something
  this pass caused or is claiming credit for, and the baseline file was left untouched since no
  code changed here)
- `npm run typecheck:functions` — 0 errors
- `npm run build` — succeeds
- `npm test` — full suite, all passing (see PR/commit for the exact file/test counts at the time
  this branch was pushed)
