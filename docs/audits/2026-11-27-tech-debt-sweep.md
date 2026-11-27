# Tech-debt sweep — 2026-11-27

Scheduled, autonomous cleanup run. Policy: delete only what is proven dead;
anything irreversible (production DDL) or behaviour-changing is reported, not
done. Every figure below was measured in this run.

## Changed

| Change | Evidence |
|---|---|
| Removed `PODCAST_TEXT_VERSION` from `supabase/functions/_shared/podcast-text.ts` | Zero references anywhere in the repo besides its declaration (knip + `grep -w` over src/, supabase/, functions/, workers/, scripts/, e2e/, .github/). `tsc -p tsconfig.app.json` reports nothing for the file (it is imported by `src/components/news/PodcastEpisodeText.tsx`). |

That is the whole diff. The repo had already been swept: knip over the root
workspace (config `knip.jsonc`) reports **0 unused files in `src/`** and no
genuinely unused root dependencies.

## Checked and kept (false positives — do not delete)

- **Dependencies** `jpeg-js`, `pngjs`, `@types/pngjs`, `parse5`: knip says
  unused; they are used by `workers/redirect-qr/render.ts` (no own
  package.json) and by edge functions through the `npm:parse5@8.0.1` alias in
  `vite.config.ts` / `tsconfig.app.json`.
- `supabase/functions/_shared/profession-keywords.d.ts`: type declarations for
  the sibling `.js`, imported by `wikidata-resolve.ts` and two scripts/tests.
- `supabase/functions/_shared/social.ts` "unused" exports: the file is the
  documented Deno twin of `src/lib/social/registry.ts` and must stay in sync.
- `e2e/support/tripPlannerCleanup.ts` `cleanupRecordedTripAccounts`: called
  from `.github/workflows/e2e-nightly.yml` via `tsx -e`.
- The other ~30 knip "unused exports" in edge functions are used inside their
  own module; dropping the `export` keyword is churn, not dead-code removal.

## GitHub Actions

- 51 workflows; every script path they reference resolves (apparent misses
  were relative to a job's `working-directory`).
- Last 100 scheduled runs (2026-11-24 → 11-27): all green except
  **`e2e-nightly.yml` (3/3 failed)**, **`pipeline-health.yml` (3/3 failed)** and
  `migration-drift-monitor.yml` (3/13 failed). These are monitors reporting
  real production state, not broken CI steps; removing them would hide the
  problems they exist to surface. **Not removed.**

## Database — candidates only, nothing dropped

Assumption: dropping production tables through an auto-applied migration is
irreversible and outward-facing, so the safe default is to report. Seven
public tables have **0 rows** and **no reference in any application code**
(src/, edge functions, Pages Functions, workers, scraper, mobile, extension,
scripts); their only DB reference is one function each:

| Table | Only reference |
|---|---|
| `security_monitoring`, `suspicious_activities`, `role_audit_logs`, `user_sessions`, `push_notification_logs`, `profiles_audit_log` | `_delete_user_data_before_email()` (GDPR erase path) |
| `scraper_stays` | `scraper_reconcile_orphans()`, `scraper_prune_orphan_mappings()` + 1 trigger |

Dropping the first six requires editing the account-deletion function in the
same migration — a privacy-critical path that deserves its own reviewed PR.
`cms_pages_translations` (15 rows, used by a view), `kink_taxonomy_versions`
(2 rows) and `scraper_migrations` (8 rows) also have no app-code readers but
hold data, so they are out of scope for a deletion sweep.

## Found, deliberately not changed

- `PATTERN_PHRASES` in `supabase/functions/_shared/news-quality/junk-phrases.ts`
  is **never applied** — 11 news-cleanup regexes (`read more`, share-icon rows,
  tracking pixels…) that no sanitizer reads. Deleting it loses intent; wiring
  it in changes published news text. Needs a decision, not a sweep.

## Not covered

Sub-workspaces with their own package.json (workers/*, scraper, mobile,
extension) were not installed, so their dependency verdicts were not
evaluated (knip.jsonc notes uninstalled workspaces give false results).
