# Dead / Orphaned / Redundant / Broken Code Audit — Follow-up, 2026-08-07

Scheduled technical-debt sweep, ~1 week after the
[2026-07-31 audit](2026-07-31-dead-code-audit-followup.md), which itself followed the
[2026-06-10 audit](2026-06-10-dead-code-audit.md). Same method: detect-first, verify each
candidate individually before touching anything, do not delete on the strength of a bulk tool
run alone. **No deletions were made in this pass** — see the summary and "why nothing was
deleted" reasoning below for each of the four areas the requesting task named.

**Method:** `npm ci` (fresh install, all sub-workspace lockfiles) · `npx knip` against the
repo's own scoped `knip.jsonc` (now committed, unlike the June/July runs which had to fall back
to knip's unscoped default and hand-bucket the noise) · manual verification of every file-level
finding via `grep`/`git grep` across the whole tree · read of all 33 `.github/workflows/*.yml`
headers · GitHub Actions run history for `migration-drift-monitor.yml` and `ci.yml` via the
GitHub API · cross-reference against `CLAUDE.md`'s documented subsystem history. No writes made
to the database, no files deleted, no dependencies removed, no CI steps removed.

## 1. Unused files / orphaned components / unused npm dependencies — no safe deletions found

`knip.jsonc` exists in the repo now (it didn't for the June/July audits) and scopes analysis
per-workspace with documented false-positive exclusions. Running it against the root workspace
(`src/`, `functions/`, `scripts/`, `e2e/`, `client-sdk/`, `workers/_shared/`,
`supabase/functions/`) found:

- **1 "unused file"** — `supabase/functions/_shared/profession-keywords.d.ts`. **Verified false
  positive**: it's the type declaration for a co-located plain-JS module
  (`profession-keywords.js`, both present on disk), imported by
  `supabase/functions/_shared/wikidata-resolve.ts` via `from './profession-keywords.js'`. TS
  resolves the `.js` import specifier to the sibling `.d.ts` for types at compile time; knip's
  static import graph doesn't model that resolution rule, so it reads as an unreferenced file.
  Deleting it would silently drop type coverage for every consumer of `wikidata-resolve.ts` (and
  the Node-side repair script the header comment says it exists specifically to serve). **Not
  deleted.**
- **0 unused runtime `dependencies`** (84 packages, zero flagged).
- **2 "unused" `devDependencies`** — `postcss`, `wrangler`. Both false positives: `postcss` is a
  peer of `@tailwindcss/vite`'s build pipeline (never imported in TS, but load-bearing for
  `vite build`); `wrangler` is invoked as a CLI (`wrangler deploy`/`wrangler dev`) from workflow
  YAML and `workers/*` READMEs, never imported. **Not removed.**
- **1 unlisted dependency** — `playwright` in `scripts/prerender.mjs`, resolved today via
  `@playwright/test`'s own dependency on `playwright`. Works, but is undeclared — a latent risk
  if `@playwright/test`'s own dependency tree ever changes shape. Flagged as a **report-only
  follow-up** (add `playwright` to `devDependencies` explicitly), not fixed here: it's an
  addition, not a deletion, and out of scope for a cleanup pass that's supposed to be
  reversible-by-omission (i.e. skipping it changes nothing today).
- **93 "unused" exports + 47 "unused" exported types**, essentially all in
  `supabase/functions/_shared/*.ts`. Spot-checked one (`wolfram-client.ts`'s exports, flagged
  unused) against the file that imports it: `supabase/functions/enrich-wolfram/index.ts` still
  imports the module and CLAUDE.md documents that its *cron* was retired
  (`20260813100000` disables the `admin_automations` registry row) but says nothing about the
  edge function itself being decommissioned — deleting the function or its shared client on the
  strength of "the cron doesn't fire it anymore" would be exactly the kind of inference CLAUDE.md's
  own "Country Completeness Engine" section describes going wrong twice already (the wolfram
  retirement resurrecting itself via `sync_automations_to_cron`, then needing a second, deliberate
  fix). The remaining ~140 flagged exports are overwhelmingly in modules CLAUDE.md explicitly
  describes as shared, pure, unit-tested building blocks for the Truth Engines (`venue-consensus.ts`,
  `dedup-engine.ts`, `city-collision-guard.ts`, `automation-utils.ts`, `wikidata-city.ts`, …) —
  verifying each one individually (does a test import it directly? does another edge function
  reference it via a re-export knip didn't trace? is it part of a documented public API surface
  even if not yet called?) is a per-item job, not something a bulk pass can respons­ibly clear in
  one sweep. **None removed.**

**Conclusion, matching both prior audits: there is no new, individually-verifiable dead
file/dependency work available at low risk this pass.** `src/` remains at zero flagged files, as
in both prior audits.

## 2. GitHub Actions workflows — no redundant or failing steps found

All 33 workflows in `.github/workflows/` serve a distinct, documented purpose — the file headers
themselves are unusually explicit about *why* each one is shaped the way it is, several
narrating a past incident that the current design specifically avoids re-triggering (e.g.
`e2e-i18n.yml`'s explanation of why it can't run on `push: main`; `e2e-pr.yml`'s note on why the
path filter moved inside the job after two PRs got permanently blocked; `claude-md-drift.yml`'s
note on why it pushes to `main` directly instead of running on PRs). Checked run history via the
GitHub API:

- `ci.yml` on `main`: last 8 runs — 6 green, 2 `cancelled` (superseded by a newer push, normal).
  No active failures.
- `migration-drift-monitor.yml`: last 10 runs (spanning 2026-08-05 through 2026-08-07) — 8
  green, 2 `failure` on 2026-08-06 (00:47 and 18:45 UTC), green again from 2026-08-06 12:57
  onward and for all 4 runs today. Self-resolved; nothing currently red. Not investigated further
  since it isn't an active fire, but flagged here in case the two 08-06 failures are worth a look
  independent of this sweep — this workflow is the safety net for exactly the "migration applied
  outside `db push`" failure mode CLAUDE.md documents biting the project twice already
  (2026-07-25/26, then again 2026-07-31, resolved same-day per the prior audit).

No duplicate jobs, no workflow referencing a since-deleted script, nothing recommended for
removal.

## 3. SQL schemas, migrations, database utility files, orphaned queries / unused tables — not attempted

Explicitly out of scope for autonomous execution this pass, for reasons the codebase's own
`CLAUDE.md` documents at length and that this audit takes as binding precedent rather than
re-deriving from scratch:

- The `events`/`cities`/`news_articles` city-linking history (2026-08-02) shows an "exactly one
  match" check reading as safe when the reference table simply couldn't represent the ambiguity
  it needed to catch, silently mis-linking 116+ live rows before the gap was caught.
- The Wolfram-country-stats retirement (`sync_automations_to_cron`) shows a cron
  `cron.unschedule` alone getting silently undone by the next reconciler pass — "looks retired"
  and "is retired" were two different, hard-to-distinguish states for weeks.
- `supabase/migrations/` holds ~900 files with an explicit warning against reusing version
  numbers and a documented history of drift incidents from applying schema changes outside the
  committed-file path.

Determining whether a given table or column is truly orphaned requires live DB introspection
(row counts, FK/trigger/RLS dependents, cron/pg_cron jobs referencing it, every edge function and
frontend query touching it) cross-referenced against the same kind of per-item verification used
in §1 — and, per the precedent above, even a clean-looking automated signal ("no code references
it") has already been wrong for this project's schema on two separate documented occasions.
Doing that responsibly for an 899-migration schema is a dedicated, live-DB-introspection pass in
its own right, not a bulk sweep alongside file/dependency/CI cleanup, and this pass did not
attempt it. No `DROP TABLE`/`DROP COLUMN`/migration deletions were made or drafted.

## 4. Dead code, unused exports, unreachable logic — see §1

Covered under the knip pass above; no removals made for the reasons given there.

## Why nothing was deleted (summary)

Every category in the requesting task (files, dependencies, CI steps, DB objects, dead code) was
scanned. The one automated "high confidence" finding this pass produced (the `.d.ts` file) turned
out to be a false positive on manual verification — which is itself the load-bearing data point:
it means a policy of "delete whatever the tool flags" would have broken a real dependency on the
very first item, in a codebase whose own two prior audits already independently converged on
"nothing safe to blind-delete" via the same method. Compounding that with two more documented
production incidents (§3) where a clean-looking "unused" signal was later proven wrong, the
justified default this pass is the same one CLAUDE.md's own principles call for: prefer a
reversible, individually-verified change over an irreversible bulk one, and when a destructive
action can't be verified at the per-item level, don't take it.

## Report-only observations / recommended next steps (none actioned)

- Declare `playwright` as an explicit `devDependency` (currently resolved transitively through
  `@playwright/test`) — low-risk, but an addition rather than a deletion, so left for a future
  pass or a human call.
- The two `migration-drift-monitor.yml` failures on 2026-08-06 (00:47, 18:45 UTC) self-resolved
  before this audit started and weren't investigated further — worth a look if anyone wants to
  understand root cause, but not an active issue.
- `supabase/functions/enrich-wolfram/` (and its `_shared/wolfram-client.ts` dependency) is
  reachable code whose only known trigger (the `wf-enrich-wolfram-countries` cron) is
  deliberately disabled per CLAUDE.md's Country Completeness Engine section. Whether the function
  itself should now be deleted, kept as a manual-trigger fallback, or left alone is a product/
  ops call this audit did not make — flagging it as the most concrete "possibly dead" candidate
  surfaced this pass, for a human or a dedicated follow-up with live deploy-list + admin-UI
  cross-reference to decide.
- Nothing in this pass touched `src/`, SQL migrations, edge functions, dependencies, or CI
  config — this audit file is the only change.
