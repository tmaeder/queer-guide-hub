# scraper/

Node harness for the one scrape that cannot run in an edge function: the weekly
gaycities.com events sweep (Cloudflare 403s non-browser clients; a headed
Playwright session on a virtual display passes clean). Has its **own**
`package.json` — run `npm install` / `npm test` from inside this directory, not
the repo root.

What lives here (post-decommission, 2026-08):
- `scripts/gaycities-sync.ts` — the live entry point. Runs weekly via GitHub
  Actions (`.github/workflows/gaycities-sync.yml`, Mondays 04:17 UTC). Staged
  rows are walked to events by the ev-drain pg_cron jobs. `npm run sync` locally.
- `scripts/gaycities-{backfill,drain,drain-mgmt,stage-mgmt}.ts` — operator
  scripts for the same source (one-shot backfill / drain tooling).
- `src/sources/gaycities/` — parser + browser session library (pure functions
  are unit-tested in `tests/unit/gaycities-parser.test.ts`).
- `src/db/staging-publisher.ts` — batch publisher into Supabase
  `ingestion_staging` (`SUPABASE_DB_URL`); idempotent via payload hashing.
- `src/types/` — zod schemas + connector types the publisher consumes.

History: this directory used to hold a full multi-source pipeline (node-cron
scheduler, orchestrator, local `scraper_*` Postgres workspace, dedupe, and
connectors for wikipedia / iglta / outsavvy / patroc / misterbnb / travelgay).
That machinery was never deployed — the Supabase `source-*` edge functions +
pipeline own ingestion — and was deleted in the 2026-08 pipeline overhaul (P7).
See `docs/deprecation-scraper-entity-tables.md`; recover via git history if a
source ever needs resurrecting.
