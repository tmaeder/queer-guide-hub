# Tech debt cleanup pass — 2026-11-06

Scheduled, unattended run. Method: `npm ci`, workspace-aware `knip` (`knip.jsonc`), each finding grepped across the repo.
Follows `2026-10-16-tech-debt-cleanup.md`; 50 commits have landed since.

## Changelog

**Deleted / removed: nothing.** No finding survived verification.

## Findings re-verified and kept

- `jpeg-js`, `pngjs`, `@types/pngjs`: imported by `workers/redirect-qr/render.ts` (no own package.json; resolved from root).
- `parse5`: pinned via `npm:parse5@8.0.1` alias in `vite.config.ts` / `tsconfig.app.json`; used by `gaych-parse.ts`, `event-source-copy.ts`, a data-quality script.
- `supabase/functions/_shared/profession-keywords.d.ts`: types for `profession-keywords.js`, imported by `wikidata-resolve.ts`.
- "Unused exports" in `functions/_lib/*` (`FEED_RKEY`, `MIN_LANDING_VENUES`, `PRICING_MARKDOWN`, `BOOT_GUARD_JS`) are used in-file or by tests; `cleanupRecordedTripAccounts` is invoked from `e2e-nightly.yml`. knip cannot see workflow callers.
- `mobile/` and `extension/` knip output is not meaningful: those workspaces are not installed here (unresolved imports).
- `src/`: no unused files or exports.

## Not changed (assumptions)

- **Migrations, tables, RPCs, crons:** untouched. Applied migrations must not be deleted or edited (`db push` history); static analysis cannot see pg_cron, PostgREST or edge-function callers; drops are irreversible and need live-DB evidence plus a human decision per object.
- **GitHub Actions:** none removed. No step is provably failing from the repo alone, and the gates encode documented protections.
- Edge-function exports (`supabase/functions/**`) left: the Deno suite is not run here.
