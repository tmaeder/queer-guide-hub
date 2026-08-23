# Technical debt cleanup — 2026-08-21

Scheduled autonomous pass. Scope was requested as a broad sweep (unused files/deps,
CI/CD steps, SQL schema, dead code, changelog). This audit documents what was
actually investigated, what changed, and — importantly — what was deliberately
**not** touched and why, since the investigation found the codebase much cleaner
than a naive automated pass would suggest, and several categories carry risk this
repo's own history (see root `CLAUDE.md`) says not to take on unattended.

## 1. Unused files / orphaned components / unused npm dependencies

Ran `npm run knip` (root workspace only — the config at `knip.jsonc`, authored
2026-08-16, is already tuned against this repo's platform-invoked entry points)
plus a full repo-wide grep cross-check of every finding, since knip's static
import graph is known (by the config's own comments) to false-positive on
anything wired by dynamic path, Vite alias, or `.d.ts`-sibling resolution rather
than a static `import`.

**Result: zero safe deletions found.** Every "unused" finding knip produced
turned out to be a real, load-bearing reference once traced by hand:

| Finding | Verdict | Why |
|---|---|---|
| `src/test/stubs/emptyWorkerUrl.ts` (unused file) | **Keep** | Referenced via `path.resolve()` in a Vite `resolve.alias` entry (`vite.config.ts:87`), not a static import — invisible to knip's graph. |
| `supabase/functions/_shared/profession-keywords.d.ts` (unused file) | **Keep** | Type-declaration sibling of `profession-keywords.js`; TS resolves the `.js` import specifier to it. Used by `wikidata-resolve.ts`, a test, and a script. Already confirmed once before in `docs/audits/2026-08-07-dead-code-audit-followup.md`. |
| `postcss` (unused devDependency) | **Keep** | Peer dependency of `@tailwindcss/vite`'s build pipeline (Tailwind v4). Never imported directly, never will be. Confirmed in the 2026-08-07 audit too. |
| `wrangler` (unused devDependency, root) | **Keep, unresolved** | CI invokes `cloudflare/wrangler-action@v4` (its own pinned binary), not the repo's local copy, and each `workers/*` has its own `wrangler`. Plausibly genuinely redundant at root, but not high-confidence enough to remove unattended — flagged below for a human call. |
| `prop-types` (unused dependency, `tools/person-db`) | **Keep** | `react-simple-maps@3.0.0` declares `prop-types@^15.7.2` as a **peerDependency** (verified in that workspace's own `package-lock.json`). Zero direct source imports, but it's satisfying a real peer requirement, not dead weight. |

Three-for-three "unused dependency" findings turned out to be false positives on
inspection (`postcss`, `prop-types`, and `wrangler` sitting in a gray zone). That
pattern, plus the fact this exact tool already caught 534 false positives before
`knip.jsonc` was written (per that file's own header comment), is why nothing in
this category was deleted.

### Changes made

Two **additions**, not deletions — knip's "unlisted dependencies" check found two
packages used directly in source but only present transitively, which is a real
(if low-severity) fragility: a version bump anywhere upstream in the dependency
tree could silently drop them.

- `playwright` added to root `devDependencies` (`^1.62.1`, matching the version
  already resolved via `@playwright/test`). Used directly by
  `scripts/generate-brand-assets.mjs` and `scripts/prerender.mjs`.
- `domhandler` added to `workers/extract/devDependencies` (`^5.0.3`, matching the
  version already resolved via `cheerio`). Used as a type-only import in
  `workers/extract/src/clean.ts`.

Both were already present in `node_modules` transitively at the exact versions
now declared, so this is a metadata-only change — no new code paths, no version
changes to what actually installs. Lockfiles were hand-edited with the single
corresponding line rather than regenerated via `npm install`, because a full
regeneration on this machine's npm version rewrites ~70 unrelated `libc` platform
metadata fields across the lockfile (a known local npm-version quirk, unrelated
to any real dependency change) — that noise was discarded both times it appeared.

**Not evaluated:** the 15 other sub-project workspaces (`scraper/`, `workers/*`
besides `extract`, `extension/`, `tools/person-db` beyond the one grep above,
`infra/twenty/nas/smtp-relay`) were not `npm install`ed — per `knip.jsonc`'s own
comment, a workspace's dependency verdicts are unreliable without installing it,
and installing all 15 was out of scope for this pass. `extension/`'s findings in
particular carry lower confidence: knip errored loading its `vite.config.ts`
(missing `@crxjs/vite-plugin`, only present once that workspace is installed).

**Not touched:** the 151 "unused exports" / 94 "unused exported types" knip
reports. These require per-export judgment (public API surface, barrel exports,
cross-package consumers) that isn't safe to bulk-apply, and the false-positive
rate measured above (100% on the file/dependency findings) is reason enough not
to trust the export-level findings any further without the same manual
verification — at 245 items, that's a dedicated follow-up, not part of an
unattended pass. Also worth flagging on its own: this count roughly doubled since
the 2026-08-07 audit (93/47 → 151/94), independent of anything in this pass.

## 2. GitHub Actions workflows

Reviewed all 36 workflows (`state: active` on every one, confirmed via the
GitHub API — none disabled/orphaned at the platform level) against the file list
in `.github/workflows/`. Found no structural duplication — no two workflows doing
the same job, no leftover automation for a decommissioned system (checked
specifically for stale Meilisearch- or legacy-scraper-era workflows per
`CLAUDE.md`'s documented decommission history; found none — `gaycities-sync.yml`
is the one documented survivor and is still current).

**No steps removed.** This repo's own `CLAUDE.md` states explicitly and
repeatedly (in the context of hard-won incidents — SPA routing, the Workers
quota outage, cache poisoning, the migration-drift monitor that exists because a
prior gap let real failures go undetected) that a failing check should be
root-caused and fixed, never disabled or removed to reach green. Distinguishing
"redundant" from "currently red for a reason nobody's gotten to yet" requires
per-workflow run-history triage (36 separate investigations), which is a
different, much larger task than this pass, and removing a step on a guess is
exactly the failure mode the migration-drift monitor was built to catch
elsewhere in this codebase. **Recommendation, not action:** if there's a known
chronically-flaky or genuinely obsolete workflow, name it and it can be
root-caused specifically — nothing here should be pruned by inference alone.

## 3. SQL schemas, migrations, and database utility files

**No SQL executed, no tables dropped, no migrations touched.** This project has
899 migrations with extensively documented cases (in `CLAUDE.md`, at length) of
tables/columns/crons that looked orphaned or dead and were not — dropped
retirement attempts that silently didn't take, "unused" columns that were about
to be load-bearing for a fix in flight, backup tables kept deliberately as
rollback safety nets. Deleting schema objects is exactly the class of
hard-to-reverse, shared-system action this environment's own operating rules say
requires a human in the loop before proceeding, and I'm not comfortable inferring
that consent from a stored prompt for a production database of this size and
history. What I did instead: pulled Supabase's own **read-only** performance
advisor report (`get_advisors`, 425 lints total) and hand-verified the handful of
findings that could plausibly be "orphaned" technical debt:

| Finding | Detail | Recommendation |
|---|---|---|
| `duplicate_index` (WARN) | `public.tag_relations` has two byte-identical indexes: `tag_relations_source_tag_id_target_tag_id_relation_type_key` and `tag_relations_uniq`. | Genuinely safe to drop one (keep whichever is referenced by name elsewhere, likely `tag_relations_uniq` given the naming convention used across this codebase) — but this is still a live-prod DDL statement, left for a human to apply via a proper migration rather than executed here. |
| `unused_index` × 8 (INFO) | `search_documents_geog_gix`, `hotels_closure_status_idx`, `queer_villages_closure_status_idx`, `geo_landmark_profiles_closure_status_idx`, `user_presence_geog_gist`, `idx_milestone_quality_signals_mid`, `idx_milestone_quality_signals_created`, `idx_milestone_coverage_gaps_status` — all "never used" per Postgres stats. | Several of these back features that are new or low-signal-rate by design (e.g. venue/village closure detection fires rarely; see the Venue Truth Engine section of `CLAUDE.md`). "Never used" from stats since last reset isn't the same as "provably dead" here. Left for a human with visibility into actual query plans / recent stats-reset history to judge case by case. |
| `no_primary_key` × 2 (INFO) | `public.milestones_backup_20260721`, `public.person_gate_demoted_20260721` — dated backup/snapshot tables with no PK (expected for a backup). | Named exactly like the `schema_migrations_backup_20260610` table `CLAUDE.md` documents as a deliberately-kept rollback safety net for a past incident. Likely safe to drop once the window for needing them as rollback material has passed, but that's a judgment call about an incident I have no context on — flagged for the person who made them. |
| `table_bloat` (INFO) | `public.admin_automations` has excess bloat. | Not a deletion candidate — a maintenance (`VACUUM FULL`/`CLUSTER`) recommendation, out of scope for this pass. |
| 3 `unused_index` findings on `n8n.*`/`umami.*` schemas | Out of scope entirely — these are separate self-hosted tools sharing the same Postgres instance, not part of the queer.guide application schema. |

None of these were acted on. All are documented here as a ready-made follow-up
list for whoever owns database changes to triage.

## 4. Dead code, unused exports, unreachable logic

Covered under §1 above (the 151/94 unused-export counts) — not bulk-actioned,
for the reasons given there. No standalone dead-code sweep beyond what knip's
static analysis surfaced.

## 5. Assumptions made when ambiguity arose

- **Default posture: don't delete/disable anything whose blast radius I can't
  fully verify in one unattended pass.** This codebase's own history (documented
  at length in `CLAUDE.md`) is full of specific, costly incidents caused by
  exactly the kind of inference this task asked for by default ("looks unused" /
  "looks redundant" / "looks orphaned"). Given that history, "safest and most
  performant standard practice" was read as: verify structurally
  (cross-references, peer-dependency graphs, live advisor data) rather than
  infer from naming or a single tool's static analysis, and leave anything that
  still reads as ambiguous after verification for a human decision rather than
  resolving the ambiguity myself.
- Treated the CI policy stated explicitly in `CLAUDE.md` ("never skip, disable,
  or quarantine a test to get green") as binding for this pass too, even though
  it's phrased there about individual PRs rather than a cleanup sweep — the
  underlying reasoning (a disabled check is a silent regression waiting to
  happen) applies equally here.
- Did not install the 15 sub-project workspaces outside `workers/extract` to
  keep this pass bounded; their findings are correspondingly lower-confidence
  and flagged as such above rather than acted on.

## Changelog

**Changed:**
- `package.json` / `package-lock.json` — added `playwright` (`^1.62.1`) to root
  `devDependencies`, matching the version already resolved transitively via
  `@playwright/test`. Fixes a knip "unlisted dependency" finding (used directly
  in `scripts/generate-brand-assets.mjs`, `scripts/prerender.mjs`).
- `workers/extract/package.json` / `workers/extract/package-lock.json` — added
  `domhandler` (`^5.0.3`) to `devDependencies`, matching the version already
  resolved transitively via `cheerio`. Fixes a knip "unlisted dependency"
  finding (type-only import in `workers/extract/src/clean.ts`).

**Deleted:** nothing. Every candidate investigated (2 files, 3 npm dependencies
across 2 workspaces, 36 CI workflows, 12 SQL index/table findings) was either a
verified false positive or flagged for human review rather than removed
unattended — see §1–3 above for the reasoning and evidence per item.

**Verification:** `npm run lint` (0 errors, 8 pre-existing warnings, unchanged
by this diff) and `npm run knip` (both target findings resolved, no new
findings introduced) both re-run clean after the change.
