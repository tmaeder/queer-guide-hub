# Dead / Orphaned / Redundant / Broken Code Audit — Follow-up, 2026-07-31

Scheduled technical-debt sweep, ~7 weeks after the
[2026-06-10 audit](2026-06-10-dead-code-audit.md). Detect-first: verify the prior audit's
remediation held, look for anything new, and do not touch files without individual verification.
No destructive deletions were made in this pass — see "Why nothing was deleted" below.

**Method:** `npx knip` (unscoped, default reporter — same trap the 2026-06-10 audit already
diagnosed) · `git grep` cross-checks · GitHub Actions run history (35 workflows) · GitHub code/
commit/PR search across all branches · live Supabase introspection (`cron.job`, `pg_proc`,
`supabase_migrations.schema_migrations`) — all read-only.

---

## 1. Verified: the 2026-06-10 remediation held

All three items left open in the prior audit are now resolved in the current tree:

| Prior finding | Status now |
|---|---|
| BR-2 — `hotel-booking`/`booking-webhook`/`booking-confirmation` wrote to a nonexistent `bookings` table | Resolved — none of the three edge functions exist anymore; the in-app booking path was removed. Affiliate-link booking is the only path, as recommended. |
| BR-5 — `send-welcome-email` never wired to an auth hook | Resolved — function now documents an internal-call trigger path (post profile-creation) instead of relying on the (never-configured) auth webhook. |
| Security — `venue-url-checker` / `marketplace-link-checker` had `verify_jwt=false` and no secret check | Resolved — both now call `requireInternalOrAdmin(req, supabase)` before doing anything. |

## 2. Re-ran the "delete unused files/deps" scan — confirmed still a dead end without a scoped config

A bare `npx knip` (no `knip.json` exists in the repo; the 2026-06-10 audit notes it used an
ad-hoc scoped config that was never committed) flags 534 "unused files," 154 "unused exports," 64
"unused types," and 42 "unlisted dependencies." Bucketing the file-level findings by top-level
directory:

```
supabase: 276   .design-sync: 55   scripts: 48   tools: 44   workers: 34
functions: 25   scraper: 25        extension: 23  public: 2   e2e: 1   infra: 1
src: 0
```

**Zero candidates in `src/`.** Every flagged file lives in a subsystem knip's default
entry-point detection can't see: Supabase edge functions (invoked by name via
`supabase functions deploy` / HTTP, not imported), Cloudflare Workers (separate `wrangler`
deploys), the scraper and extension (separate `package.json`s), one-shot operator scripts
(invoked via CLI, protected by convention per the root `CLAUDE.md`), and `.design-sync/`
(driven by the Design & Branding Control Center tooling, not the Vite import graph). Spot-checked
the first two hits (`.design-sync/fonts-inter.css`, `.design-sync/gen-types-entry.mjs`) — both
are live, config-driven assets, confirming the false-positive pattern rather than sampling
further. The two "unused" devDependencies knip flags (`lint-staged`, `postcss`) were already
individually verified live in the prior audit (RD-3) — `lint-staged` runs via its own config-key
convention, `postcss` is a peer of `@tailwindcss/vite`.

Only two `src/` exports were flagged (`makeQueryClient`, `expectNoPlaceholderLeaks` in
`src/test/test-utils.tsx`) — test helpers exported for reuse, not dead code; left alone
(consistent with DE-2's "no action" call on the larger June export list).

**Conclusion:** there is no new, individually-verifiable dead-file/dependency work available at
low risk this pass. A real dead-code sweep of the non-`src` subsystems requires the same
per-candidate method the June audit used (live deployed-function list diff, cron/pipeline
cross-reference, DB introspection) — not a blind bulk delete off an unscoped tool run. Given the
prior sweep already went through that process exhaustively 7 weeks ago, redoing it from scratch
was out of scope for this pass; recommend repeating the June method again only after another
comparable stretch of feature work (e.g. quarterly).

## 3. CI/CD — no redundant or failing steps found

All 35 workflows in `.github/workflows/` serve a distinct purpose (deploy, lint/typecheck/test
gates, nightly data-quality/trust-safety/pipeline-health checks, SEO/sitemap/search-eval
monitors, migration-drift/repair safety nets). Scheduled workflows are deliberately staggered
across the day (e.g. `gaycities-sync.yml`: "Mondays 04:17 UTC, off the 03:00 cron herd") — this
is intentional design, not cruft. Recent run history for the workflows with run data available
was 100% green except for one real, fresh failure — see §4. No duplicate jobs, no dead workflow
files referencing removed scripts, nothing recommended for removal.

## 4. NEW — production migration drift, unrecoverable from git (needs owner action)

`migration-drift-monitor.yml` (runs every 6h) went from green to **failing** at
**2026-07-31 18:47 UTC** — its first failure in the run history checked. It caught exactly the
failure mode it exists to catch: two versions applied to production with no matching repo file,
which makes `supabase db push` **silently skip** every future migration (per the `CLAUDE.md`
Migrations section).

| Version | Name (as applied) |
|---|---|
| `20260806100000` | `revive_dead_scoring_crons` |
| `20260806110000` | `marketplace_adopt_orphan_staging` |

Investigation (read-only, no writes made):

- Neither version exists as a file anywhere in `supabase/migrations/` on `main`.
- `supabase_migrations.schema_migrations.statements` for both rows contains **only a breadcrumb
  comment** — `-- applied via Management API; canonical source:
  supabase/migrations/<version>_<name>.sql` — not the actual DDL that ran. Whoever applied these
  used the raw Management API SQL path (the exact anti-pattern the `CLAUDE.md` Migrations gotcha
  warns about: "Raw Management-API SQL does NOT record history → drift returns") and intended to
  commit a matching file afterward, but the commit never landed.
- Searched for the two filenames and both migration names across: `git grep` on `main`, GitHub
  code search, GitHub commit search, GitHub PR search (title+body), and all 15 open branches by
  name — no match anywhere. The source does not exist in this repository's history.
- Live introspection to see if the effect was reconstructable from current state:
  `cron.job` has no entry that looks freshly "revived" under a scoring-related name beyond the
  two pre-existing jobs (`marketplace_relevance_rescore_weekly`, `visibility_score_batch`); no
  `pg_proc` function named anything like `adopt_orphan`/`orphan_staging` exists. Nothing found
  with high enough confidence to reverse-engineer the original migration.

**Why nothing was fabricated here:** reconstructing DDL for an already-applied production change
from partial state introspection risks writing a migration file that *claims* to be the
historical record of what ran but doesn't actually match it — actively worse than the current
honest "we don't know" state, on a database backing a platform with safety-gated content for
users in high-risk countries. This needs either (a) whoever ran the original SQL to supply the
source from their own history/session, or (b) a deliberate, reviewed reconstruction from a full
DB diff against the pre-`20260806100000` state, which is a job for the project owner or a
dedicated session with that context — not a blind autonomous guess.

**Recommended next step:** recover both files per the existing `CLAUDE.md` runbook (`supabase
migration repair` / recover-into-a-file flow) once the actual SQL is located, then commit at the
exact stamped versions so `db push` and the drift monitor go green again. Until then, **every
migration merged to `main` will silently fail to apply to production.**

## Report-only observations

- No new orphaned root-level images, no new zero-ref edge functions found via spot checks beyond
  what §2 already covers.
- Repo-wide dependency/lockfile state unchanged since the June audit's `RD-3` conclusions; no new
  candidates surfaced.
- Nothing in this pass touched `src/`, SQL migrations, edge functions, or CI config — this file
  is the only change.
