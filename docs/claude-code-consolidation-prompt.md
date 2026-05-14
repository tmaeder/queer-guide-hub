# Claude Code prompt — queer.guide consolidation sprint

Paste the section below the `---` into Claude Code from the repo root (`/Users/tobiasmaeder/queer-guide-hub`). It is self-contained — it does not assume the model has seen the critique or `CLAUDE.md`.

The prompt is structured as a multi-phase consolidation engagement with explicit verification gates, parallel subagent delegation where safe, and hard stops before any irreversible action. It is designed to be run interactively over multiple sessions, not as a one-shot.

---

# MISSION

You are the lead engineer on a consolidation sprint for `queer.guide`. Your job is **not to add features**. Your job is to reduce surface area, retire deprecated code, fix documentation drift, and harden operational posture — without breaking production.

The repository lives at the current working directory. Read `CLAUDE.md` and `docs/architecture-critique-2026-05-01.md` before you do anything else. They are your brief.

You operate under three rules that override anything else:

1. **No new features.** If a task implies new product surface area, stop and report. Consolidation only.
2. **No destructive operation without an explicit confirmation gate.** Deleting files, dropping tables, removing migrations, force-pushing, modifying production cron — every one of these requires you to (a) describe the change, (b) describe the rollback, (c) wait for the user to confirm in chat.
3. **Verification before declaration.** Do not say "done" until you have shown the actual evidence: file listings, test output, type-check passing, search results returning empty for the thing you removed.

You will be doing significant work across many files. Use `TodoWrite` to maintain a phase-level plan and check items off as you complete them. Use the `Plan` subagent before any phase that touches more than 10 files. Use the `Explore` subagent for read-only inventory work to keep your main context small. Use `general-purpose` subagents for parallelisable batched work (e.g. "rewrite these 30 files to import from the new module").

---

## PHASE 0 — Orient (read-only, no changes)

Before any work, build a fresh evidence base. Do this in parallel where possible.

Spawn three `Explore` subagents in a single message:

1. **Inventory subagent.** Confirm or correct these counts: edge functions under `supabase/functions/`, migrations under `supabase/migrations/`, components under `src/components/`, files importing `@mui/material`, files importing `@/components/ui`, files importing both. Report exact numbers and the 10 most-recent edits in each area (by `git log -1 --format=%aI -- <path>`).

2. **Deprecation subagent.** Find every function under `supabase/functions/` that returns HTTP 410 or contains `deprecated`/`legacy`/`Use X instead` in its `index.ts`. List them with the comment they carry. Also find any `supabase/migrations/*legacy*.sql` files and report which of their objects (tables, views, functions) are still referenced anywhere in `src/`, `supabase/functions/`, `workers/`, or `scraper/`.

3. **Operational-state subagent.** Find every `cron` schedule (search for `* * * *` patterns in migrations and `wrangler.toml` files), every direct write path to `news_articles` (search for `INSERT INTO news_articles` and Supabase client `.from('news_articles').insert`), and any reference to `algolia-sync`, `universal_search`, or `algolia-search` outside their own definitions. Report the call sites.

Once all three reports are back, write a short `docs/consolidation-state-2026-05-01.md` with the facts. This is your source of truth for the rest of the engagement. Update `CLAUDE.md`'s drift-prone numbers (function count, migration count, worker list) at the same time. Do not change anything else in `CLAUDE.md` yet.

**Gate:** Show the user the state doc and the proposed `CLAUDE.md` diff before continuing.

---

## PHASE 1 — Delete deferred-deletion code

The lowest-risk, highest-clarity move. Three targets:

### 1a. The 410-stub functions

For each function identified by Phase 0's deprecation subagent that returns HTTP 410, do the following in a single PR-equivalent commit:

- Confirm with `git log` that the stub has been returning 410 for at least 30 days. If not, surface this and do not delete.
- Confirm with `grep -r` across `src/`, `supabase/functions/`, `workers/`, and `scraper/` that no caller still hits the function URL or imports anything from its directory.
- Delete the function directory.
- Add a single line to `docs/consolidation-state-2026-05-01.md` recording the deletion and the date.

**Anti-pattern to avoid:** Do not delete a function just because it has "deprecated" in a comment. The 410 + 30-day cooldown + zero-callers triple is the bar.

### 1b. The duplicate `news_articles` write path

Phase 0 should have surfaced that the legacy `fetch-news` edge function still writes to `news_articles` directly when triggered from the admin UI (`NewsSourcesManager` line ~595 per the existing `CLAUDE.md` note). Do not delete `fetch-news` yet. Instead:

- Add a feature flag (Supabase project setting or env var) `NEWS_LEGACY_ADMIN_TRIGGER_ENABLED`, default `false`.
- Gate the admin UI's manual-trigger button on that flag.
- Surface a banner on the admin pipelines page when the flag is on, saying "Legacy direct-write path is enabled for emergency use only."
- Update `docs/consolidation-state-2026-05-01.md` with a 30-day deprecation timer and the date the flag should be removed entirely.

This is not a deletion. It is a forcing function.

### 1c. The `legacy.sql` migration stubs

For each `*legacy*.sql` file in `supabase/migrations/`:

- Use `Explore` to find every object (table, view, function, type, index) defined in the file.
- Search the rest of the codebase for references to each object.
- If any object is still referenced, the file stays. Add a comment to the top of the file explaining why.
- If no object is referenced, propose deletion via the Gate below.

**Gate:** Before deleting any migration file, present the list to the user with proof of zero references. Migration deletions are irreversible and can break new-environment provisioning if a downstream migration depends on something the legacy file created. Wait for explicit approval.

---

## PHASE 2 — Per-source importer consolidation

The repo currently has ~17 `import-*` and ~4 `source-*` Deno functions, one per data source. Most share 80% of their logic (auth, retry, normalisation, write to `ingestion_staging`). Consolidate them.

### Steps

1. Use `Plan` subagent to produce a step-by-step plan for replacing per-source functions with a single parameterised `source-fetch` function backed by a `data_sources` table. The plan must address: how source-specific config (auth, endpoints, rate limits, parser selection) is stored; how source-specific parsers are loaded (one file per source under `supabase/functions/source-fetch/parsers/`); how the workflow-dispatcher invokes it; how migration happens incrementally without breaking active cron jobs.

2. Implement the new `source-fetch` function with **two** parsers first — pick the two most recently modified `import-*` functions as the pilots. Keep the original functions deployed; do not remove them.

3. Run the new pipeline against a single source in a staging environment (see Phase 5 — staging readiness). Verify by reading `ingestion_staging` rows and confirming dedup against existing data.

4. Once parity is proven for the two pilot sources over at least one full daily cron cycle, plan migration of the remaining ~19 sources in batches of three. Each batch follows the same pattern: implement parser, run in parallel, verify parity, switch the workflow trigger, observe one cycle, retire the old function.

**Anti-pattern to avoid:** Do not do a "big bang" rewrite of all 21 sources in one PR. The cost of a regression is invisible (silently missing data) and the regression surface is large.

**Gate:** Before retiring any old `import-*` or `source-*` function, show the user a parity report: row counts in `ingestion_staging` from old vs new path over the last 7 days, dedup rate, error rate.

---

## PHASE 3 — UI library decision and migration plan (no code yet)

The frontend ships both MUI and shadcn/ui. ~501 files import MUI; ~449 import shadcn. Pick one.

### Steps

1. Write `docs/adrs/0001-ui-library-consolidation.md` as a real Architecture Decision Record using the template at `/var/folders/8j/vz2v6_m97sl8hwwgwlwg2ln80000gn/T/claude-hostloop-plugins/4ddcc2961c3896b2/skills/architecture` (or follow the standard ADR shape: Status, Context, Decision, Options Considered with trade-off table, Consequences, Action Items).

2. The two real options are: (A) consolidate to shadcn/ui, removing MUI; (B) consolidate to MUI, removing shadcn. A third option of "permanently support both" should be included but argued against. Be honest about cost — for whichever option wins, the migration touches roughly the smaller set's worth of files (449 if you pick MUI, 501 if you pick shadcn).

3. The ADR's Action Items section must include a forcing function: an ESLint rule that bans net-new imports of the losing library, with a date by which the existing imports must be migrated. Without a hard rule, both libraries will continue to grow.

4. **Do not start migration in this phase.** This phase produces a decision artifact. Migration is a separate engagement.

**Gate:** Present the ADR to the user. Wait for status to be flipped from `Proposed` to `Accepted` by the user before any code changes follow.

---

## PHASE 4 — Migration consolidation

645 migrations including pre-2026 `legacy.sql` stubs. Squash to a baseline.

### Steps

1. Use `general-purpose` subagent to produce `supabase/migrations/00000000000000_baseline.sql` representing the schema state as of the last migration before `2026-01-01`. Generate it from the live Supabase schema (`supabase db dump` or `pg_dump --schema-only`), not by concatenating old migration files. Include `COMMENT ON` statements documenting each table's purpose where the original migrations had them.

2. Move all pre-2026 migrations into `supabase/migrations/_archive/`. Do not delete. They are documentation.

3. Verify the baseline by spinning up a fresh Supabase local environment, running `00000000000000_baseline.sql` followed by every 2026 migration, and confirming the resulting schema matches a fresh dump from production. Diff and report.

4. **Do not deploy this to production.** The baseline replaces history; production already has all 645 migrations applied. The baseline is for new environments (CI, contributors, fork projects). Document this clearly in `docs/migrations.md`.

5. While you have the baseline in hand, write a follow-up ADR `docs/adrs/0002-schema-naming-cleanup.md` proposing a single migration to fix the column-name inconsistencies documented in `CLAUDE.md` (`news_articles.is_featured` vs `venues.featured`; `personalities.birth_date` vs older fields; `news_sources.source_type` vs `.type`; `events.title` vs `.name`; `unified_tags` vs `tags`). Include for each rename: the SQL, the application-layer changes required, and a backwards-compatibility view that lets you ship in two phases.

**Gate:** Present the baseline and the diff against production schema. Do not proceed without user confirmation. Schema baselines are a load-bearing piece of infrastructure.

---

## PHASE 5 — Operational hardening

These are non-controversial — do them in parallel.

### 5a. Get out of iCloud (manual instruction, not code)

Detect whether the working copy is under `~/Library/Mobile Documents/`. If so, **do not** try to move it yourself. Print a warning at the top of your final report: "This repo is in iCloud. The user must `mv` it to a non-synced location and re-clone. iCloud will eventually corrupt `.git` objects." This is environmental — Claude Code cannot fix it safely.

### 5b. Restore e2e tests

`npm run test:e2e` exists but is "not actively maintained" per `CLAUDE.md`. Do not try to revive every spec. Instead:

- Identify the three highest-value flows: (1) Chrome extension submission via `workers/submit/`, (2) news pipeline end-to-end (trigger workflow, observe staged → committed transition), (3) Stripe checkout via `create-checkout-session` + `stripe-webhook`.
- For each, write or repair a single Playwright spec that exercises the full path. Run them locally and confirm they pass.
- Wire them into a GitHub Actions workflow that runs on PRs touching the relevant directories.
- Delete or `skip()` every other e2e spec that doesn't currently pass — either it earns its keep or it goes. Untrustworthy tests are worse than no tests.

### 5c. Operational runbook

Create `docs/operations.md` covering:

- How to verify each pipeline is healthy (which Supabase view to query, what counts to expect, what alerts to set).
- How to retry a stuck workflow run (`workflow_runs` row update SQL with explanation).
- How to add a new data source (link to the new `source-fetch` parser pattern from Phase 2 once it exists).
- How to roll back a bad edge function deploy.
- What to check first when search returns empty results (Meilisearch health, search-proxy worker logs, embedding cache state).
- The 410-stub deletion log (referenced from Phase 1).

This file is the single thing you should be able to hand to someone covering for the maintainer for two weeks.

### 5d. Sentry SLOs

Sentry is in `package.json` deps. Confirm it is initialised in `src/main.tsx` and at least one edge function. If not, surface as a finding but do not implement — Sentry initialisation touches auth keys and should be done by the user.

---

## PHASE 6 — Final report

Produce `docs/consolidation-2026-Q2-final.md` summarising:

- Numbers before and after for: edge functions, migrations, MUI imports, shadcn imports, components, lines of code.
- List of every file deleted, with link to the commit.
- List of every ADR produced, with status.
- Open items deferred to a future engagement (UI migration execution, schema rename execution, Sentry SLO definition, full e2e coverage expansion).
- Anything you found mid-engagement that surprised you and that the user should know about.

Update `CLAUDE.md` with the corrected numbers and a pointer to this final report under "Architecture history."

---

## OPERATING PROTOCOL — read this carefully

**On context.** Use subagents aggressively. Your context is finite; theirs resets. Send `Explore` for read-only inventory, `Plan` for strategy on multi-file changes, `general-purpose` for parallel batched edits. Do not read 50 files into your own context if a subagent can summarise them in 200 words.

**On parallelism.** When you spawn multiple subagents that don't depend on each other, dispatch them in a single tool-use turn. The user is paying for wall-clock time, not your sequencing preferences.

**On confirmation.** Every Gate above is a hard stop. Do not infer permission from the user's earlier "go ahead" — each Gate is its own decision. If the user says "use your judgement," still surface the gate and the rollback before acting on irreversible changes (deletion, schema changes, cron modification).

**On scope creep.** If you find a bug while doing this work, do not fix it. Log it in `docs/consolidation-state-2026-05-01.md` under "Discovered issues" and continue. New bugs are not consolidation work. The exception: if a bug actively blocks a consolidation step (e.g. a test fails for an unrelated reason and you can't validate Phase 4), surface it and wait for direction.

**On the bot-commit pattern.** The git history shows ~71% of commits from `gpt-engineer-app[bot]`. Your commits should be human-attributed (or `Co-Authored-By: Claude`). Do not impersonate prior bot accounts. Each commit message should describe *why*, not just *what* — this codebase needs more durable rationale, not less.

**On reversibility.** Every step has a rollback. Before any destructive operation, write the rollback in chat. Examples: deleting a function — `git revert <sha>` plus `supabase functions deploy <name>`. Squashing migrations — keep the `_archive/` directory; production isn't affected. Fixing column names — backwards-compatible view first, application layer migrates, drop original column last.

**On stopping.** When you are uncertain whether something is a consolidation task or a feature task, it is a feature task. Stop and ask. Almost everything in this codebase touches something else; it is easier to ask than to undo.

---

## DEFINITION OF DONE

This engagement is complete when:

1. `docs/consolidation-state-2026-05-01.md` exists and is up-to-date.
2. Every 410-stub function from Phase 1a is either gone or has a recorded reason for staying.
3. The `news_articles` legacy admin write path is feature-flagged off by default with a deprecation timer.
4. Pilot of `source-fetch` is running in production for at least two sources with parity reports.
5. `docs/adrs/0001-ui-library-consolidation.md` is `Accepted` (or explicitly `Rejected` with rationale) by the user.
6. `supabase/migrations/00000000000000_baseline.sql` exists, has been verified against production schema, and old migrations live under `_archive/`.
7. Three e2e tests pass locally and in CI; everything else is `skip()` or deleted.
8. `docs/operations.md` exists and is good enough to hand to a fill-in maintainer.
9. `CLAUDE.md` numbers match reality.
10. `docs/consolidation-2026-Q2-final.md` exists with before/after metrics.

Anything not on that list is out of scope.

Now: read `CLAUDE.md` and `docs/architecture-critique-2026-05-01.md`, write the Phase 0 plan with `TodoWrite`, and dispatch the three `Explore` subagents in your next turn.
