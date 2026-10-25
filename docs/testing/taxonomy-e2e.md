# Taxonomy mutation regressions

`npm run test:e2e:taxonomies` runs 53 browser cases: 15 dictionary families and 38 classification families from `src/config/taxonomyCatalog.ts`. Each case creates its own record through the admin UI, reloads and reopens it, edits its label and sort order, reloads and verifies again, then cleans up. Tags instead preserve their existing `unverified` Verification while editing the name. The generic classifications workspace is shared by its 38 families.

## Environment

Use a disposable local Supabase database loaded from the repository's CI snapshot. The existing PR workflow provisions it, applies migrations, creates a synthetic admin, builds the app against it, and runs this suite before the other critical-path specs.

For local runs, start a build/preview connected to that local database and set:

- `E2E_BASE_URL`: loopback frontend URL, e.g. `http://127.0.0.1:4174`.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: the local Supabase API URL and key used by that frontend build.
- `E2E_TAXONOMY_DB_URL`: the same local database's PostgreSQL URL.
- `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`: that disposable database's synthetic admin credentials.
- Optional `E2E_PSQL_BIN`: path to `psql` when it is not on PATH (e.g. Homebrew libpq on macOS).

Run `npm run test:e2e:taxonomies -- --list` to inspect coverage without running browsers. `npm run test:e2e:taxonomies:contracts` checks coverage and endpoint/cleanup refusal. `npx tsc -p tsconfig.taxonomy-e2e.json` checks the suite's types.

## Isolation and cleanup

The dedicated config rejects any remote frontend, API or PostgreSQL URL before auth setup. A browser network guard also blocks Supabase requests to an unexpected origin. The normal Playwright config excludes this mutating spec, so production nightly runs cannot discover it accidentally.

Each test owns a random UUID-derived name prefix. Teardown closes its page to stop pending writes, removes only matching owned records and their CMS metadata, and verifies absence. This still runs after assertion failures or missing save responses. Intimate interests get an owned parent category; children are removed first, and synthetic admin eligibility is restored afterward.

Managed taxonomy deletion is normally prohibited. Cleanup uses an exclusive table lock and restores the managed deletion trigger in the same transaction; failures roll back trigger changes. No production RPC, migration or permanent guard change is added. Existing records are never used as mutable fixtures. Normal audit history is retained in the disposable database.

## Evidence

The CI `taxonomy-e2e-report` artifact contains the HTML report, `taxonomies.json`, failure traces/screenshots, each case's saved-record evidence, and a cleanup attachment showing removed/remaining rows, metadata counts and guard restoration. Missing credentials or a bad target fail the dedicated suite rather than reporting skipped coverage. Forks without a local snapshot do not run this mutation step.
