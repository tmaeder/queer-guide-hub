# Technical debt cleanup — eighth pass, 2026-09-04

Scheduled autonomous cleanup pass. This is the **eighth** pass of this kind on this repo — prior
ones are [2026-06-10](2026-06-10-dead-code-audit.md),
[2026-07-31](2026-07-31-dead-code-audit-followup.md),
[2026-08-07](2026-08-07-dead-code-audit-followup.md),
[2026-08-21](2026-08-21-tech-debt-cleanup.md), [2026-08-28](2026-08-28-tech-debt-candidates.md),
[2026-09-02](2026-09-02-tech-debt-cleanup.md), and
[2026-09-02 (second same-day pass)](2026-09-02-tech-debt-cleanup-2.md) — the sixth and seventh of
which each found **zero** safe deletions and concluded the repo was at (or very near) the
static-analysis floor for this scope.

## Scope decision, stated up front

The task that triggers these passes asks for cleanup "throughout the stack," explicitly including
SQL schemas/migrations and CI workflow steps. Every prior pass in this series made the same call
this one does, and it is restated rather than silently inherited: **this pass did not delete,
alter, or propose executing any change to `supabase/migrations/`, database tables/indexes, or
CI/CD workflow steps.** `CLAUDE.md` — this repo's own incident log — is substantially a record of
specific, costly cases where a signal that looked exactly like "unused"/"orphaned"/"redundant" by
static analysis turned out to be load-bearing through a path static analysis cannot see: a cron
job, a Worker, a reconciler pass that silently un-retires things, a column read only by a
different code path than the one that writes it. Acting on that class of signal without the
runtime verification those incidents required (live `cron.job` state, actual query-plan traffic,
confirming an incident is closed rather than that a table's name is old) is exactly the mistake
this file exists to prevent. Where this pass's tooling surfaced a new instance of that class (one
new DB index, below), it is recorded as a candidate for a human with that verification access, not
executed.

This pass's actual, executed scope: unused files/dead code/unused dependencies in the frontend
(`src/`), matching the two-thirds of the original request (steps 1 and 4) that a static,
repo-local sweep can respond to safely without database or infrastructure access.

## Method

Fresh `npm install` at root (this sandbox started with no `node_modules` — `knip`, `depcheck`,
etc. were not runnable until installed). Then, in order:

1. A read-only exploration pass (import-graph walk of `src/`, since tooling wasn't installed yet)
   to find candidate orphaned files, cross-checked against everything `CLAUDE.md` records as
   "already removed" to rule out stale leftovers of known-good deletions.
2. Independent re-verification of every candidate with whole-repo `grep` (not just import
   resolution — also catches string-based/dynamic references and comment mentions), before
   deleting anything.
3. `npx knip` (the repo's own `knip.jsonc`, already configured for this monorepo's shape) as a
   second, independent method — run *after* the verified deletions, so it confirms the resulting
   tree rather than duplicating the first pass.
4. `npx depcheck` at root as a cross-check on dependencies.
5. A hand-written exact-duplicate-CI-step scanner (parses every `.github/workflows/*.yml` job with
   PyYAML, normalizes each step minus `name`, flags any step body repeated within a job and any
   job whose full step sequence is byte-identical to or a prefix-subset of another job's in the
   same file) — same method the sixth/seventh passes used.
6. A read-only `get_advisors(type=performance)` pull against the live production Supabase project,
   parsed programmatically and diffed against the seventh pass's table.
7. Full verification: `npm run lint`, `npm run typecheck`, `npm run typecheck:functions`,
   `npm run build`, `npm test` (full suite) — all against the final state.

## Result: 6 files deleted — the first deletions since the fifth pass

### 1. Orphaned files in `src/` — 6 deleted

All six were independently confirmed via whole-repo `grep` (zero references anywhere outside the
file's own declaration and, in two cases, comments that mention the file only in past tense as
"the thing this replaced") before deletion, then re-confirmed by a fresh `knip` run and the full
build/typecheck/test suite afterward.

| File | Why it's dead |
|---|---|
| `src/components/country/CountryPracticalInfo.tsx` | Superseded by `CountryFactSheet.tsx`, whose own header comment says so ("definition-list fix `CountryPracticalInfo` established"). `CountryDetail.tsx`/`CityDetail.tsx`/`QueerVillageDetail.tsx` all reference it only in past-tense comments describing what replaced it. |
| `src/pages/city-detail/CitySectionDefs.ts` | Zero references anywhere. Its own header comment describes it as a section-order model, but `CityDetail.tsx` actually builds sections via a completely different shared abstraction (`geoSections()`/`GeoSection` from `@/components/geo/geoSectionModel`). A written-but-never-wired-in artifact of the `2026-08-21-country-single-restructure` refactor plan. |
| `src/pages/country-detail/CountrySectionDefs.ts` | Same refactor, same shape. This was the *only* file in its directory — `country-detail/` contained nothing else. |
| `src/pages/queer-village-detail/VillageSectionDefs.ts` | Same refactor, same shape. Also the only file in its directory. |
| `src/hooks/useDepartureBoard.ts` | Superseded hook. The live homepage departures board (`src/components/home/subway/DeparturesBoard.tsx`) actually imports `useHomeNearYou`, not this. |
| `src/hooks/useLatestNews.ts` | Superseded by `useNewsFront`/`useForYouNews`. A test file (`NewsMagazine.test.tsx`) carries an explicit dated comment admitting this: "The band reads the RANKED feed now, not `published_at desc` — mocking `useLatestNews` here would leave the real hooks running." |

Checked for siblings of the same abandoned refactor (`SectionDefs`/`SECTION_ORDER`/`SectionId`
across `src/`) — none found beyond the three already deleted; the other matches are unrelated
uses of the word "section" (Cockpit sections, rights-map sections).

Deleting these fixed 2 pre-existing baseline TypeScript errors that had been carried in
`scripts/typecheck-baseline.json` against dead code — the ratchet's baseline was re-written
(`npm run typecheck:baseline`) to lock that improvement in (832 errors, down from 834, zero new).

### 2. Dependencies — none removed (reconfirmed, no change)

`depcheck` at root: `brace-expansion` (deliberately unimported per `knip.jsonc`'s own comment,
anchoring an `overrides` security pin) and the usual tooling-config-only devDependencies invisible
to it via config/hooks (`husky`, `lint-staged`, `prettier`, `tailwindcss`, `knip`, `serve`,
`wrangler`). `knip`'s own dependency report: `prop-types` (in `tools/person-db/package.json`, a
separate sub-project, previously confirmed as a real `react-simple-maps` peer-dependency need) and
`wrangler` at root — re-checked the reason to keep it (`deploy-pages.yml`'s
`wranglerVersion: '4.127.0'` still matches `package.json`'s pin exactly). Both are the same two
false-positive findings every pass back to 2026-08-07 has carried and reconfirmed; neither was
touched.

### 3. Two more standing false positives, reconfirmed rather than re-litigated from scratch

`knip`'s "Unused files" report still names `src/test/stubs/emptyWorkerUrl.ts` (a Vite
`resolve.alias` target, invisible to knip's import graph) and
`supabase/functions/_shared/profession-keywords.d.ts` (the `.d.ts` sibling of a `.js` file
imported by a Deno edge function, a Node script, and a test — confirmed by direct grep this pass,
same result as every prior audit back to 2026-08-07). Both left alone.

### 4. Dead/commented-out code — none found

No `.bak`/`.old`/`.orig`/`.deprecated` files anywhere outside `node_modules`. No commented-out
code blocks beyond the repo's established prose-documentation style (rationale comments and
"this was deleted, here's why" postmortem comments — not disabled code left in place).

### 5. GitHub Actions workflows — no exact duplicates, no broken references

38 workflow files (was 37 as of the seventh pass — ordinary forward progress on `main`, not a
finding). The structural duplicate-step scanner found **zero** within-job duplicate step bodies
and **zero** cross-job identical-or-prefix-subset step sequences across all 38 files. No
`npm run <script>` reference to a script that no longer exists in `package.json`.

### 6. Edge functions — no genuine orphans (not re-litigated; nothing in this diff touches them)

This pass did not modify `supabase/functions/`, so the standing candidate from every prior pass
(`supabase/functions/enrich-wolfram/` + `_shared/wolfram-client.ts`, the retired-cron fallback
function — see the seventh pass's writeup) is carried forward unchanged. Deleting it outright vs.
keeping it as a manual fallback remains a product/ops call, not a static-analysis call.

### 7. Database — one new advisory finding, not executed

Read-only `get_advisors(type=performance)` against the live production project
(`xqeacpakadqfxjxjcewc`): 420 total lints (up from 419 in the seventh pass) — 350
`unindexed_foreign_keys`, 56 `multiple_permissive_policies`, **10** `unused_index` (up from 9), 3
`no_primary_key`, 1 `table_bloat`. All previously-known `unused_index` rows (`search_documents_geog_gix`,
`user_presence_geog_gist`, `idx_village_city_merge_audit_village`,
`idx_nonplace_city_deletion_audit_city`, `idx_community_groups_archived_at`, plus 4 rows on
`n8n.*`/`umami.*` — a separate self-hosted tool sharing the Postgres instance, out of scope) are
unchanged.

**One genuinely new row:** `idx_crc_disagrees` on `public.country_rights_corroboration`. This
table backs the "second opinion on the two fields that drive the safety gate" feature that landed
in the most recent commit on `main` before this pass (`9d8c145`, PR #3383) — i.e. it is a brand
new table with naturally little traffic yet, not a stale leftover. Per the scope decision above,
**not dropped.** Recorded here as a candidate for a human with query-plan visibility once the
feature has had real traffic; dropping a fresh index on a fresh safety-relevant table from a
same-day static advisory reading is exactly the pattern this file's incident log warns against.

## What would need to happen before any of §5–7's carried-forward candidates could move from
"candidate" to "safe to execute"

Unchanged from every prior audit: for the edge function, check `admin_automations` and live
`cron.job` state, not just source references; for the DB indexes/tables, check actual recent
query-plan usage over a real traffic window and confirm the incident/sweep each backup table
exists for is closed, not just that the table's name is old. Nothing in this pass changed that
answer.

## Changelog (this branch)

**Deleted (6 files, all `src/`, zero non-comment references confirmed by two independent
methods):**
- `src/components/country/CountryPracticalInfo.tsx`
- `src/pages/city-detail/CitySectionDefs.ts`
- `src/pages/country-detail/CountrySectionDefs.ts` (and the now-empty `country-detail/` directory)
- `src/pages/queer-village-detail/VillageSectionDefs.ts` (and the now-empty `queer-village-detail/`
  directory)
- `src/hooks/useDepartureBoard.ts`
- `src/hooks/useLatestNews.ts`

**Changed:**
- `scripts/typecheck-baseline.json` — re-written via `npm run typecheck:baseline` to drop 2
  baseline errors that lived only in the deleted files (832 errors across 290 files, was 834).

**Not changed / explicitly out of scope this pass:** no npm dependencies removed (both
knip/depcheck candidates are documented false positives, reconfirmed); no CI/CD workflow steps
removed (none are redundant or broken); no SQL migrations, tables, indexes, or edge functions
touched (see "Scope decision" above and §7's one new advisory finding, left for human review).

**Added:** this audit document only.

**Verification** (all re-run against the final state of this branch — `main` plus the 6 deletions,
the baseline update, and this document):
- `npm run lint` — passes, 0 errors
- `npm run typecheck` — baseline ratchet: 832 errors, none new vs. the just-updated baseline
- `npm run typecheck:functions` — 0 errors (zero-tolerance gate, unaffected since nothing under
  `functions/` changed)
- `npm run build` — succeeds
- `npm test` — full suite: **1269 test files passed (1269), 9778 tests passed (9778)**, 0 failures

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01S5GxnZSDeQJZwaXPXhPVnA
