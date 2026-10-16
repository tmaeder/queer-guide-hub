# Tech debt cleanup pass — 2026-10-16

Scheduled, unattended run. Method: `npm ci` + workspace-aware `knip` (`knip.jsonc`), every finding grepped across the whole repo.

## Changelog

**Deleted / removed: nothing.** No finding survived verification.

## Candidates re-verified and kept

- `src/test/stubs/emptyWorkerUrl.ts` — alias target in `vite.config.ts:87`.
- `supabase/functions/_shared/profession-keywords.d.ts` — types for `profession-keywords.js`, imported by `wikidata-resolve.ts`.
- `jpeg-js`, `pngjs`, `@types/pngjs` — imported by `workers/redirect-qr/render.ts`, which has no package.json of its own and resolves them from the root.
- `wrangler` — pinned in `deploy-pages.yml` and used by `scripts/sync-basemap-assets.sh`.
- Unlisted `miniflare` / `swift` in redirect test scripts — operator-only tooling, not production dependencies.

## Not changed (assumptions)

- **Migrations, tables, RPCs, crons:** untouched. Applied migrations must never be deleted or edited (`db push` history), static analysis cannot see pg_cron / PostgREST / edge-function callers, and drops are irreversible. Dropping tables needs live-DB evidence and a human decision per object.
- **GitHub Actions:** none removed. No step is provably failing from the repo alone; gates encode documented protections.
- **~67 unused exports / 38 unused types in `supabase/functions/**`:** left. They are largely test-facing API surface and the Deno suite cannot be run here to prove removal safe. `src/` has zero unused exports.
- Duplicate export in `scripts/data-quality/kinktionary-new-term-definitions.mjs` (`TERMS` + `default`): left, harmless.
