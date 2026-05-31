# scraper/

Standalone Node scraping pipeline (Cheerio + Playwright). Has its **own** `package.json` — run `npm install` / `npm test` from inside this directory, not the repo root.

What lives here:
- `src/` source adapters (each extends `base.ts` and is registered in `src/index.ts`), pipeline glue; `tests/`, `docs/`, `scripts/`.
- Runs via GitHub Actions cron (daily full refresh 03:15 UTC + hourly events).

Conventions:
- A new source = a new adapter extending the base class + a row in the registry + a `scrape_sources` DB entry.
- Adapters for sources currently disabled in `scrape_sources` (e.g. Cloudflare-403 / SPA-blocked sources) are kept on purpose — the block is technical, not a permanent retirement.
