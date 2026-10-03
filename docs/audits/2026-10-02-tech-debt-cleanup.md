# Tech debt cleanup pass — 2026-10-02

Scheduled, unattended run. Method: `npm ci` + workspace-aware `knip` (config: `knip.jsonc`),
each finding verified by grep across the whole repo, not just `src/`.

## Changed

- `src/test/test-utils.tsx`: `makeQueryClient` is no longer exported. Zero external call sites
  (only used inside the same file); knip "unused export". Behaviour unchanged.

## Candidates found and kept (documented false positives, re-verified)

- `src/test/stubs/emptyWorkerUrl.ts` — `vite.config.ts` `resolve.alias` target (vitest stub for maplibre `?worker&url`).
- `supabase/functions/_shared/profession-keywords.d.ts` — type declaration for `profession-keywords.js`,
  imported by `wikidata-resolve.ts`, a unit test and an operator script.
- `wrangler` (root devDependency) — pinned to `4.141.0`, same as `wranglerVersion` in `deploy-pages.yml`;
  also used via `npx wrangler` in `scripts/sync-basemap-assets.sh`.
- `prop-types` (`tools/person-db`) — peerDependency of `react-simple-maps@3`.

## Not changed, with reason

- **SQL migrations / tables / RPCs / crons:** not touched. No usage evidence can be gathered statically
  (callers include pg_cron, edge functions, PostgREST clients), drops are irreversible, and `CLAUDE.md`
  records many incidents of "looks unused" objects being load-bearing. Needs live-DB evidence
  (`pg_stat_user_tables`, advisors) and a human decision per object.
- **GitHub Actions workflows:** none removed. Several required checks and schedule-only gates look
  redundant from the YAML but encode documented protections (drift monitor/recovery, health gates).
  Removing a gate without run-history evidence is unsafe; no step was proven failing from the repo alone.
- **~76 unused exports / 51 unused types under `supabase/functions/_shared`, `extension/`, `scraper/`,
  `workers/`, `tools/`:** left. Deno edge-function tests cannot be run in this environment, and many are
  deliberate test/API surface. Removing `export` is low value and not verifiable here.
- `supabase/functions/enrich-wolfram/` + `_shared/wolfram-client.ts`: prior passes kept as manual
  fallback; product call.

## Verification

- `npx knip`: remaining unused files are the two false positives above.
- `npm run lint` / `npm run typecheck` results below in the PR.
