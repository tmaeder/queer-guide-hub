# Critical architecture review — queer.guide

**Date:** 2026-05-01
**Author:** Claude (architecture skill)
**Scope:** Whole-system review based on `CLAUDE.md`, repository inspection, and git history.
**Disposition:** Evaluation, not an ADR. No decisions are proposed in binding form — this is a critique meant to feed prioritisation.

---

## TL;DR

queer.guide is a remarkably ambitious one-person product: a multilingual LGBTQ+ travel and community platform with a venue/event/hotel/marketplace/news/personalities catalog, a Chrome submission extension, hybrid search, multi-source ingestion, and payments — all running on Supabase + Cloudflare. The architectural ideas are mostly sound; the problem is that the surface area has outgrown the team that maintains it. The codebase shows the unmistakable signature of AI-accelerated development with insufficient consolidation: 605 components, 202 edge functions, 645 migrations, two parallel UI libraries, three search systems in different deprecation states, and 71% of commits from `gpt-engineer-app[bot]`. The single biggest risk is not any one design choice — it is the cost of operating this much code with one human in the loop.

The strongest move available is not "fix" anything specific but **stop adding surface area, retire what's already deprecated, and consolidate**. Concrete priorities at the end.

---

## What's actually there (vs what `CLAUDE.md` claims)

`CLAUDE.md` is a thoughtful project memory file but it is already stale, which is itself a finding:

| Claim in `CLAUDE.md` | Reality | Drift |
|---|---|---|
| "118 Deno edge functions" | 202 | +71% |
| "435+ PostgreSQL migrations" | 645 | +48% |
| "Six CF workers" (email-ingest, scraper-api, geo-boundaries-worker, tiles-worker, search-proxy, submit) | Four directories under `workers/` (`ingest`, `search-proxy`, `submit`, `snapshot-archiver`) | Different set entirely |

Documentation drift of this magnitude in a doc the user wrote *for themselves* tells you the codebase is moving faster than the human can keep up with. That's the real headline.

---

## What the codebase looks like under the hood

### Frontend — two UI libraries running in parallel

The frontend is React 19 + Vite + TS, which is fine. What is not fine is that **501 of the 605 component files import from `@mui/material` and 449 import from `@/components/ui` (shadcn/ui)**. There is enormous overlap — you have effectively shipped two design systems to users, with two theming surfaces (the MUI theme in `src/theme/muiTheme.ts` and the CSS-variable system in `src/index.css`), two component vocabularies (`<Button>` from MUI vs `<Button>` from shadcn), and two styling paradigms (Emotion CSS-in-JS for MUI vs Tailwind utilities for shadcn). The Vite config bundles MUI + Emotion into a single `mui` chunk and bundles shadcn into the default chunks; users download both.

This isn't unusual when shadcn is being introduced as a successor to MUI, but the file counts (501 vs 449) say neither is the loser. There is no migration path visible. This is a tax on every new feature: the developer has to choose, and "depends which file I'm in" is not a design system.

The dependency list also shows feature creep at the framework layer: `exceljs`, `pdfjs-dist`, `mammoth`, `html2canvas`, `hls.js`, `react-force-graph-2d`, `motion`, `boneyard-js`, `@xyflow/react`, `@dnd-kit/*`, `@bigheads/core`, `@tiptap/*` (15 separate Tiptap extensions). Each of these is justified locally (export to Excel, PDF processing, video, network graph, drag-and-drop, avatar generator, rich editor) but together they form a 1.5MB+ bundle for what is fundamentally a content site.

### Edge functions — over-decomposed and accumulating

202 functions is a lot for a one-person project. The naming patterns reveal the issue:

- 16 `pipeline-*` functions (the new DAG nodes)
- 17 `import-*` functions (per-source importers — Eventbrite, Foursquare, Google Places, TripAdvisor, Ticketmaster, ILGA, etc.)
- 8 `fetch-*` functions (Wikipedia, ILGA, images for personalities/venues/cities/countries, news)
- 6 `automation-*` functions (which appear to overlap with `content-automation`'s 11 modules totaling 2,433 lines)
- 4 `enrich-*` functions (logos, venue, wolfram, AI — overlapping with content-automation again)
- 4 `source-*` functions (GayCities, ILGA, Refuge Restrooms, Spartacus)

`content-automation` at 2,433 lines is doing the same job as the new `pipeline-*` decomposition is supposed to replace, and **`ingestion-pipeline` and `algolia-search` are still deployed but return HTTP 410 with "Use X instead" comments**. Deferred deletion is a smell: 410'd functions still cost you cold-start budget, deploy time, and reader attention.

The granularity story is also confused. Splitting ingestion into 10 DAG nodes (`source-rss-news` → `pipeline-normalize` → `pipeline-sanitize-news` → `pipeline-enrich-news` → `pipeline-quality-enhance` → `pipeline-validate` → `pipeline-deduplicate` → `pipeline-quality-score` → `pipeline-review-gate` → `pipeline-commit`) is conceptually clean, but each node is its own Deno function with its own deploy, its own cold start, its own error surface, and its own version drift. The marketplace pipeline does the same with 13 nodes. Whether this is right depends on whether nodes are truly reused across pipelines (the `pipeline-validate` and `pipeline-deduplicate` having "marketplace branch" and "news branch" suggests partial reuse with branching — which is the worst of both worlds).

### Database — 645 migrations is operational debt

645 migrations including 10 `legacy.sql` stubs from July 2025 means migrations have never been consolidated. The cost surfaces in three places:

1. **Schema review.** Anyone (including the author in six months) trying to understand "what does this table look like and why" has to play archaeologist across hundreds of files.
2. **Cold environments.** Spinning up a new Supabase project — for a fork, a staging environment, a contributor — replays 645 migrations sequentially. This works until something subtle drifts.
3. **The `CONCURRENTLY` constraint.** Supabase migrations run inside transactions, so `CREATE INDEX CONCURRENTLY` is unavailable. At 645 migrations of accumulated changes, large index builds eventually become a production-blocking problem. A rebase of the schema is needed *before* it becomes urgent.

The naming inconsistencies flagged in `CLAUDE.md` itself (`news_articles.is_featured` vs `venues.featured`; `personalities.birth_date` vs older `birth_year`; `news_sources.source_type` vs `.type`; `events.title` vs `.name` vs `unified_tags` having no `is_active`) are symptoms of evolutionary schema design without a consolidation pass. They will keep generating "gotcha" entries in `CLAUDE.md` as long as the underlying schema is allowed to drift.

### Workflow orchestration — custom-built on Postgres

The architecture uses pgmq + a `workflow-dispatcher` edge function + `workflow_definitions` and `workflow_runs` tables to orchestrate 24 workflows with retries, exponential backoff, idempotency keys, and concurrency limits. This is a respectable little orchestrator. It's also competing with Inngest, Temporal, Trigger.dev, and Cloudflare Workflows — all of which would do the same job with someone else writing the bug fixes. For a solo project, building your own workflow engine is the kind of thing that's fun to write and expensive to own. The cost shows up later: when a job gets stuck, when the retry curve doesn't match observed failure modes, when you need a UI to retry a single failure, when you need cross-tenant isolation.

The very recent news pipeline cutover (2026-04-30, one day before this review) is well-handled — `CLAUDE.md` notes the legacy `fetch-news` cron was disabled by migration `20260429310000` after a sanity check that the canonical pipeline was registered and enabled. That's the right discipline. But the legacy `fetch-news` function still writes directly to `news_articles` from the admin UI, bypassing the pipeline. Two write paths to the same table is the kind of thing that causes a fingerprint collision at 2 AM six months from now.

### Search — three systems in different states

`CLAUDE.md` describes Meilisearch (current), PostgreSQL `universal_search()` (deprecated), and `algolia-sync` (deprecated). `algolia-search` returns 410. Meilisearch is self-hosted on Infomaniak, with a `search-proxy` worker, a `meilisearch-sync` edge function, and 9 indexes (venues, events, cities, countries, news, marketplace, personalities, tags, queer_villages). Hybrid keyword + semantic via OpenAI embeddings.

The architecture is fine. The concern is the surface area: self-hosting Meilisearch means you own its uptime, version upgrades, embedding model changes, and the cost of OpenAI API calls. For a one-person team, "I run my own search cluster" is a thing that occasionally turns into "search has been broken for 4 hours and I'm at a wedding."

### Operational maturity

There is no visible:

- Centralised monitoring / alerting story (Sentry is in the deps, which is good — but no SLOs, no runbook directory, no incident playbook is referenced)
- Read-replica / archival strategy for the single Supabase database
- Load testing or capacity plan for the ingestion pipelines (what happens when 50 sources fail at the same time and pgmq fills up?)
- Disaster recovery / backup verification
- Functional CI gate (`e2e/` exists; `npm run test:e2e` is "not actively maintained" per `CLAUDE.md`)

And one operational anti-pattern worth calling out by name: **the repo lives in an iCloud-synced folder, and `CLAUDE.md` includes `brctl download .git` as a recovery command**. iCloud will, eventually, corrupt or lose `.git` objects in a way `git fsck` can't recover from. The cost of moving the working copy out of iCloud is a `mv` and a `git clone`. Do it before it bites.

### Bus factor

Git history shows 2,278 total commits: 1,575 from `gpt-engineer-app[bot]`, 637 from `tmaeder`, 63 from `Claude`, plus a couple of automation accounts. **71% bot-assisted.** This is not a value judgement — AI-accelerated development is the new normal — but it does explain the shape of the codebase. Every code generation tool produces more code than it deletes. Without an explicit consolidation pass, you accumulate.

The single-human-contributor pattern means the bus factor is 1. Recovery from "Tobias is unavailable for two weeks" is materially harder than for a team-built codebase, because all the unwritten context (which 410-stub is safe to delete, which migration was the one that fixed the duplicate-fingerprint bug, why the Klaviyo plugin authentication is in this file) lives in one head.

---

## What's working well

The critique above might read as one-sided. It isn't meant to. Several things are correct enough that they should be preserved through any consolidation:

The ingestion pipeline's **fingerprint-based idempotency** (SHA-256 of normalized_title + published_day + source_id, with URL fallback) plus `UNIQUE` constraints plus `news_dedup_audit` is exactly the right shape. The marketplace pipeline's atomic commit via advisory lock + price-history delta is also right. **Source health auto-management** (exponential backoff, auto-pause at 8 consecutive failures, eligibility RPC) is well-thought-through and exactly what you want when you're running unattended overnight. The `pipeline-enrich-news` LLM call being **circuit-broken** is a small detail that suggests the author has learned the right lessons.

The **submit worker** verifying user JWTs and feeding submissions into the same `ingestion_staging` table is a clean architectural choice — one validation/dedup/quality path for everything, regardless of whether it came from a scraper or a user. **Rate limiting on the submit worker via KV** is the right primitive.

The recent **news pipeline cutover** with a pre-flight check before disabling the legacy cron, and the **`CLAUDE.md` migration-consolidation gotcha list** (the column-name traps), show a developer who knows the codebase is messy and is keeping notes to themselves. That's the right instinct.

TypeScript config has `noImplicitAny`, `strictNullChecks`, `noUnusedParameters`, `noUnusedLocals` — a `grep -rn ": any" src` returned **zero hits**. Type discipline on the frontend is genuinely good, even if `"strict": true` isn't on yet.

---

## Trade-offs that are worth re-examining

These are the architectural calls I'd ask the most pointed questions about, in priority order:

**1. Two UI libraries.** Pick one. shadcn/ui is the more maintainable long-term choice for a Tailwind-native React 19 app, and the design system described in `CLAUDE.md` (flat, monochrome, magenta accent, no shadows/borders/radii) is already easier to express in Tailwind tokens than in MUI's theme. But this is a multi-month migration touching ~500 files, and "do nothing" is a real option; the cost is a permanently fatter bundle and a permanent "which one do I use?" tax. There is no good third path.

**2. Custom workflow orchestrator.** pgmq + workflow-dispatcher works *today*. The question is what happens when it doesn't — when a workflow gets stuck, when retries snowball, when you need to see "all runs of this DAG in the last 24h with their status and timing" without writing a custom admin page. Cloudflare Workflows or Inngest would give you that view for free. A targeted migration of the news + marketplace pipelines (the ones that matter most) onto a managed orchestrator would cut your operational surface area significantly. Not urgent, but worth a real evaluation before adding the next 24 workflows.

**3. Self-hosted Meilisearch.** Same calculus. If search downtime would hurt the product, the cost of running a replica + monitoring + upgrade pipeline is non-trivial. Meilisearch Cloud or Typesense Cloud removes a thing from your plate. The cost is roughly the same as the Infomaniak bill plus your time.

**4. Per-source importers as separate functions.** 17 `import-*` and 8 `fetch-*` functions is a maintenance multiplier. If they share 80% of their code (auth, retry, normalisation, write to staging), they should be one function with a `source` parameter and a registry, not 25 functions. This is the most concretely fixable item on this list.

**5. Migration consolidation.** Squash everything before, say, `20260101` into a single `00_baseline.sql`. The 10 `legacy.sql` files from July 2025 are the obvious starting point. Cost: a long afternoon. Benefit: every future cold-environment spin-up gets faster and you get to delete `CLAUDE.md`'s "DB Column Names (common traps)" section because you can fix the names at the same time.

---

## Recommendations, in priority order

Each of these has a clear "smaller version" that captures most of the value if the bigger one is too much.

1. **Get the repo out of iCloud.** Today. `mv ~/queer-guide-hub /somewhere/else` and re-clone if needed. The cost is ~10 minutes; the worst case if you don't is unrecoverable.

2. **Delete the deprecated 410-stub functions.** `algolia-search`, `ingestion-pipeline`, and any `fetch-news` automated entry points (cron is disabled; the function and the admin button still exist). Either keep them with a comment explaining why, or remove. Don't leave deferred deletes.

3. **Inventory and consolidate the per-source importers.** Replace `import-eventbrite-events`, `import-foursquare-*`, etc. with a single `source-fetch` function that takes a `source_id` and looks up its config in a `data_sources` table. Tactical version: just the Eventbrite/Foursquare/Google Places trio first.

4. **Pick one UI library and write the migration plan as an explicit ADR.** Not "we'll move to shadcn over time" — a real plan with a date and a way to measure progress (e.g. "MUI imports must drop below 100 files by 2026-09-01"). Without a forcing function, this stays at 501/449 forever. Tactical version: ban net-new MUI imports in lint, leave existing alone.

5. **Squash migrations.** Collapse pre-2026 migrations into one baseline file. Verify by spinning up a fresh Supabase project from the baseline + recent migrations and running the e2e tests. Tactical version: just delete the 10 `legacy.sql` stubs that no current code references.

6. **Re-enable and own the e2e tests.** "Not actively maintained" plus 41% unit-test coverage means a lot of untested integration. At the volume of nightly cron jobs and pipeline executions this codebase has, regressions ship quietly. Tactical version: pick the three most important user flows (submit a venue via extension, run the news pipeline end-to-end, complete a Stripe checkout) and write *those* e2e tests. Run them in CI.

7. **Document the operational story.** A short `docs/operations.md` covering: how to know if the pipelines are healthy (which dashboard, which queries), how to retry a stuck workflow, how to add a new source, how to roll back a bad deploy, what to check when search returns nothing. Tactical version: a runbook for the *one* thing that breaks most often.

8. **Set a feature freeze and consolidate for one cycle.** This is the meta-recommendation. The codebase doesn't need more features right now — it needs less code doing the same job. A 4–6 week consolidation sprint where the rule is "delete or merge two files for every new file" would compound for years.

---

## Things I'd want to verify before going further

- **Production telemetry** — are pipelines actually completing? What's the failure rate on `pipeline-enrich-news`? Sentry should answer this; I haven't checked.
- **Cost** — Supabase function invocations + OpenAI embedding calls + Meilisearch hosting + Anthropic Haiku calls for marketplace relevance. At 24 workflows running on cron, this can drift quickly.
- **Auth & RLS audit** — `CLAUDE.md` mentions RLS on user-submission columns. The whole RLS story (especially around admin pipeline editing and `personalities_internal_notes`) deserves its own review.
- **The Chrome extension's threat model** — JWT-verified user submissions go straight into the same staging table as scraper output. That's good design, but the abuse story (one user spamming 10K submissions, content-policy violations, etc.) wasn't visible in this review.

---

## A note on the meta-pattern

The deeper observation is this: queer.guide is a one-person product with the surface area of a Series-A startup. AI-accelerated development made that possible — and the tradeoff is that the consolidation work that a team of five would do as part of normal code review never happens. That work is now a thing you have to schedule explicitly. The codebase will keep accreting in proportion to how many features you ship; it will not consolidate itself. The single most valuable engineering move available to a solo developer in this position is to **refuse new features for a defined window and do nothing but consolidate**. The product won't notice. The codebase will notice for years.

---

*This review was generated from `CLAUDE.md`, repository metadata, and a structured exploration agent's findings. It is not a substitute for reading the code; it is a starting point for prioritisation. None of the recommendations should be acted on without your judgement of which ones actually matter for your goals.*
