# Repo Map

Navigation chart for the Queer Guide monorepo (LGBTQ+ travel & community platform at
queer.guide). High-level companion to [`../../CLAUDE.md`](../../CLAUDE.md), which carries the
authoritative architecture and pipeline detail. Produced during the `/codebase-declutter` pass.

## Top-level folders

| Folder | Purpose |
|--------|---------|
| `src/` | React 19 + Vite 6 + TS SPA — the frontend. ~1,550 component files, 358 page files, 548 hooks. |
| `supabase/functions/` | 197 Deno edge functions (data sources, pipeline stages, webhooks, admin ops) + `_shared/` (58 helper modules). Canonical location. |
| `supabase/migrations/` | 428 PostgreSQL migrations (schema, RLS, cron seeds, workflow_definitions seeds). Canonical location. |
| `workers/` | 8 Cloudflare Workers: `ingest`, `search-proxy`, `submit`, `snapshot-archiver`, `image-cdn`, `image-ingest`, `geo`, `trip-inbox`. Each deploys independently via `wrangler`. |
| `scraper/` | Node scraping pipeline (Cheerio + Playwright). Own `package.json`/`src`/`tests`. Source adapters in `scraper/src`. Runs via GitHub Actions cron. |
| `extension/` | MV3 Chrome extension (React 19) — extracts venues/events/hotels/etc. from any page → `workers/submit`. |
| `client-sdk/` | Published client SDK surface. |
| `e2e/` | Playwright specs. Nightly full run + PR smoke (`.github/workflows/e2e-*.yml`). |
| `docs/` | Project docs (architecture, a11y-audit, design-system, perf, runbooks, search-intelligence, testing). |
| `scripts/` | One-shot operator scripts + CI helpers (check-env, sync-locales, bundle-shape, a11y/seo scans). |
| `meilisearch/` | Self-hosted Meilisearch config (Docker Compose, Caddy, index setup). |
| `infra/` | Infrastructure config. |
| `functions/` | Root-level functions dir (distinct from `supabase/functions/`). |
| `public/` | Static assets incl. self-hosted Inter woff2 fonts. |

## Entry points

- **Frontend:** `src/main.tsx` → `src/App.tsx` → `src/routes.tsx` (React Router). Built by Vite; `index.html` is the shell. Deployed to Cloudflare Pages on push to `main`.
- **Edge functions:** each `supabase/functions/<name>/index.ts` is an HTTP endpoint. Invoked by cron (`cron.job`), the `workflow-dispatcher` / `pipeline-executor` DAGs (`workflow_definitions`), the frontend (`supabase.functions.invoke`), external webhooks (Stripe, Meta, Sentry, Turnstile), and admin UI.
- **Workers:** each `workers/<name>/` with its own `wrangler` config.
- **Jobs/crons:** scraper (GitHub Actions: daily 03:15 UTC full + hourly events); pipeline crons (news hourly, marketplace/venue daily, event-quality loop); SQL recompute jobs.

## Dependency map (high-risk / heavy)

Frontend heavy deps are all lazy-loaded and split into manual Vite chunks (see `vite.config.ts`):
`maplibre-gl` (maps), `@tiptap/*` (editor), `recharts` (charts), `react-force-graph-2d` (graph),
`exceljs` (xlsx export — lazy), `mammoth` (docx — lazy), `pdfjs-dist` (pdf — lazy), `hls.js`
(video), `@sentry/*` (monitoring), `i18next` (11 languages). Data layer: TanStack
Query/Router/Table; Supabase JS client (`src/integrations`). No `moment`/full `lodash`.

Backend: edge functions share logic through `supabase/functions/_shared/` (supabase-client,
confidence-scoring, ai-enrichment, automation-utils, venue-consensus, …) — no
significant duplicate-helper drift.

## Surface area (public)

- Public SPA routes (cities, countries, venues, events, news, marketplace, personalities, trips, help/safety).
- Search API via `search-proxy` worker → Meilisearch (indexes: venues, events, cities, countries, news, marketplace, personalities, tags, queer_villages).
- Payment endpoints (Stripe checkout + webhook).
- Extension submission endpoint (`workers/submit`).
- `client-sdk/` exported surface.

## Hot vs cold paths

- **Hot** (cautious — high blast radius): public page rendering, search, image CDN, the SPA shell/router, the live ingestion pipeline stages (`pipeline-*`, `source-rss-news`, commit RPCs).
- **Cold** (safer to trim): admin screens, backfill/one-shot edge functions, operator scripts in `scripts/`, disabled scrape sources, deprecated/migration-disabled functions, unused UI primitives.

The declutter targets cold paths only; see [`docs/audits/2026-05-31-declutter-candidates.md`](../../DECLUTTER_CANDIDATES.md).
