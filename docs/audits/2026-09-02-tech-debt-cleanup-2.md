# Technical debt cleanup — seventh pass, 2026-09-02

Scheduled autonomous cleanup pass. This is the **seventh** pass of this kind on this repo — prior
ones are [2026-06-10](2026-06-10-dead-code-audit.md),
[2026-07-31](2026-07-31-dead-code-audit-followup.md),
[2026-08-07](2026-08-07-dead-code-audit-followup.md),
[2026-08-21](2026-08-21-tech-debt-cleanup.md), [2026-08-28](2026-08-28-tech-debt-candidates.md),
and [2026-09-02](2026-09-02-tech-debt-cleanup.md) (the most recent, PR #3288 — zero deletions,
every check reconfirmed against the then-current `main`).

Since the sixth pass (PR #3288, merged as `b402c72a2`), `main` advanced 28 commits to `34ad0400c`
— all bug fixes, data-quality migrations, and CI hardening for the news/tag/pipeline machinery
(a migration-version-collision fix, an LLM circuit-breaker repair, a tag-revival correction, an
events staging drain fix, etc.). Nothing in that range added a new frontend surface, dependency,
or workflow file of the kind that typically produces cleanup candidates, but this pass re-ran the
full methodology against the new state anyway rather than assuming the prior findings still hold,
per the task's own instruction.

**Method (identical to the sixth pass):** fresh `npm install` at root and `scraper/`; `npx knip`
against the repo's own `knip.jsonc` (covers `extension/`, `workers/*`, `tools/person-db/`, and
`scraper/` too via its workspace config — no separate `extension/`-local knip run was needed this
time, the config-load error the fifth pass hit did not recur); `npx depcheck` at root and in
`scraper/` as a cross-check; a hand-written exact-duplicate-CI-step scanner (parses every
`.github/workflows/*.yml` job with PyYAML, normalizes each step minus `name`, flags any step body
repeated within a job and any job whose full step sequence is a byte-identical match or
prefix-subset of another job's in the same file); a per-function literal grep sweep of all 227
`supabase/functions/*` names against the whole repo (one `grep -rl` per name, function's own
directory excluded, run as a background job to avoid the 2-minute foreground timeout); a live
read-only `get_advisors(type=performance)` pull against the production Supabase project, parsed
programmatically rather than skimmed to catch anything genuinely new among the 419 lint rows.

## Result: nothing new to execute this pass — again

Every check reconfirmed the 2026-09-02 audit's findings, byte-for-byte, on the current `main`.
**No files were deleted, no dependencies were removed, no dead code was removed, no CI steps were
removed.** This is the second consecutive pass with this outcome, following the sixth pass, which
itself followed the fifth pass finding only one devDependency. The repo remains at (or very near)
the static-analysis floor for what a conservative automated sweep of this scope can find.

### 1. Files / dependencies / dead code in `src/` — zero, unchanged

`knip` reports **zero** unused files in `src/`. The two repo-wide "unused files" it still reports —
`src/test/stubs/emptyWorkerUrl.ts` (a Vite `resolve.alias` target, invisible to knip's import
graph) and `supabase/functions/_shared/profession-keywords.d.ts` (a `.js`/`.d.ts`
sibling-resolution pair) — are the same two documented false positives carried since the
2026-08-07 audit, re-verified again, still load-bearing, not touched.

Root `Unused dependencies`/`Unused devDependencies`: only `prop-types` (in
`tools/person-db/package.json`, out of scope, previously confirmed as a real
`react-simple-maps` peer-dependency need) and `wrangler` (root devDependency). Re-checked the
version-pin lockstep this pass specifically claimed as the reason to keep it:
`deploy-pages.yml`'s `wranglerVersion: '4.127.0'` still matches `package.json`'s
`"wrangler": "4.127.0"` exactly on current `main` — unchanged since the 2026-09-01 dependency
bump PR #3252. **Do not remove.**

`depcheck` (root and `scraper/`) reported nothing beyond the same known false positives
(tooling-config-only deps depcheck can't see via config/hooks — `husky`, `lint-staged`,
`prettier`, `tailwindcss`, plus `wrangler` again; `brace-expansion` deliberately unimported per
`knip.jsonc`'s own comment, anchoring an `overrides` security pin). `scraper/` `depcheck` is
completely clean (`No depcheck issue`).

**Unused exports/types:** knip's full-repo counts (163 exports / 97 types) sit almost entirely in
`supabase/functions/_shared/*.ts`, `scraper/`, `extension/`, `workers/*`, and `tools/person-db/` —
out of this task's `src/`-only scope. Filtered to `src/` specifically: **exactly one item**,
`makeQueryClient` in `src/test/test-utils.tsx` (used internally in the same file, exported
otherwise unreferenced) — the identical finding carried since the 2026-08-28 pass, left alone
again for the same reason (near-zero-value change, not worth a diff).

### 2. Edge functions — zero genuine orphans, standing candidate unchanged

The per-name grep sweep (227 non-`_`-prefixed `supabase/functions/*` directories, one individual
`grep -rl` per name with that function's own directory excluded) found **zero names with no
reference anywhere else in the repo.** Every function is reachable from config, a migration,
another function, `src/`, `workers/`, or docs.

Standing candidate carried forward unchanged, re-checked again this pass:
`supabase/functions/enrich-wolfram/` (+ `_shared/wolfram-client.ts`). `wf-enrich-wolfram-countries`
remains the disabled/retired cron per `20260813100000_retire_wolfram_cron_registry_row.sql`, and
`20261029094600_source_aids_ch_cron.sql` still cites that retirement in a comment as precedent for
retiring a cron correctly — nothing in the 28 commits since the last pass touched this. Same
conclusion as every prior pass: deleting the function outright vs. keeping it as a manual fallback
is a product/ops call this sweep cannot make.

### 3. GitHub Actions workflows — no exact duplicates

37 workflow files (was 36 as of 2026-08-28/2026-09-02 — no red flag; the added file is a normal
part of `main`'s forward progress, not something introduced by this pass). The structural scanner
(byte-identical step bodies within a job, and byte-identical or prefix-subset full step sequences
across jobs in the same file) found **zero matches across all 37 files** — same result as every
prior pass.

### 4. Database — advisor data re-pulled and diffed programmatically, nothing new

Read-only `get_advisors(type=performance)` against the live production project
(`xqeacpakadqfxjxjcewc`), this time parsed as JSON and diffed against the 2026-09-02 pass's table
rather than eyeballed. **419 total lints — the exact same count as the 2026-09-02 pass** (350
`unindexed_foreign_keys`, 56 `multiple_permissive_policies`, 9 `unused_index`, 3 `no_primary_key`,
1 `table_bloat`). Restricting to the categories relevant to *orphaned* objects, every single
finding matches the prior pass's list **verbatim, same 9 `unused_index` rows and same 3
`no_primary_key` rows** — no new candidates appeared and none disappeared:

| Finding | Detail | Status vs. 2026-09-02 | Recommendation |
|---|---|---|---|
| `duplicate_index` | — | Still resolved — 0 rows. | None needed. |
| `unused_index` — `search_documents_geog_gix`, `user_presence_geog_gist` | Same two carried since 2026-08-21. | Unchanged. | Low-traffic-by-design features (PostGIS geo search, live presence). Left for a human with query-plan visibility. |
| `unused_index` — `idx_village_city_merge_audit_village` | Same as 2026-08-28/2026-09-02. | Unchanged. | Young low-write audit table; expected. |
| `unused_index` — `idx_nonplace_city_deletion_audit_city` | Same as 2026-09-02. | Unchanged. | One-shot audit table for the "non-place city shells" deletion; near-zero traffic expected after its initial write. Not a real candidate. |
| `unused_index` — `idx_community_groups_archived_at` | Same as 2026-09-02. | Unchanged. | Partial index on a state most rows don't carry yet; expected. Not a real candidate. |
| `unused_index` — 4 findings on `n8n.*`/`umami.*` | Same 4 as 2026-09-02. | Unchanged. | Separate self-hosted tools sharing the Postgres instance — not queer.guide's schema, out of scope. |
| `no_primary_key` — `public.milestones_backup_20260721`, `public.person_gate_demoted_20260721` | Unchanged. | Unchanged. | Dated backup/snapshot tables; retention is a human call tied to the incident they back. |
| `no_primary_key` — `public.unified_tag_assignments_backup_20260916` | Unchanged. | Unchanged. | Deliberate pre-sweep snapshot table, RLS-enabled, revoked from anon/authenticated — keep until the sweep it backs is confirmed final. |
| `table_bloat` — `public.admin_automations` | Unchanged. | Unchanged. | Vacuum/autovacuum tuning, out of scope for a code-level cleanup pass. |

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
- `npm run lint` — see final report for exact counts
- `npm run typecheck` — baseline ratchet, 0 new errors vs. `scripts/typecheck-baseline.json`
  (file untouched, since no code changed here)
- `npm run typecheck:functions` — 0 errors
- `npm run build` — succeeds
- `npm test` — full suite, all passing (see PR/commit for the exact file/test counts at the time
  this branch was pushed)
