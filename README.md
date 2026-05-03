# Queer Guide

The global platform for LGBTQ+ travel, community, and safe spaces at [queer.guide](https://queer.guide).

## Tech stack

- **Frontend:** Vite 6 + React 19 + TypeScript 5.8 + Tailwind + MUI 7 + shadcn/ui
- **Routing/data:** TanStack Router + Query + Table
- **Backend:** [Supabase](https://supabase.com) — PostgreSQL 17.4, Auth, Storage, Realtime, Edge Functions (Deno)
- **Hosting:** Cloudflare Pages (`queer-guide.pages.dev`) + Cloudflare Workers
- **Search:** Self-hosted Meilisearch (hybrid keyword + semantic) + pgvector + Cloudflare Workers AI (bge embeddings, reranker) via AI Gateway
- **Maps:** MapLibre GL with Protomaps basemaps + Mapbox geocoding
- **Editor:** Tiptap
- **AI:** Anthropic Claude (Haiku for relevance gating) + OpenAI GPT-4o-mini (tagging, RAG)
- **Workflows:** pgmq + `workflow-dispatcher` edge function (24 workflow definitions)
- **Payments:** Stripe
- **Analytics:** Umami (self-hosted)
- **i18n:** i18next — 11 languages (ar, de, en, es, fr, it, ja, ko, pt, ru, zh)

## Local development

Requirements: Node.js 18+ and npm.

```sh
npm install --legacy-peer-deps   # date-fns v4 vs react-day-picker v8 peer conflict
npm run dev                       # port 8080
```

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build → `dist/` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |
| `npm run preview` | Preview production build |

## Project structure

```
src/                       # React app (~90 pages, feature-grouped components)
supabase/
├── functions/             # 118 Edge Functions (Deno)
└── migrations/            # 435+ PostgreSQL migrations
workers/                   # Cloudflare Workers (email-ingest, scraper-api, search-proxy, …)
scraper/                   # Scraping pipeline (Cheerio + Playwright)
meilisearch/               # Self-hosted Meili config (Docker Compose, Caddy, index scripts)
client-sdk/                # Search client SDK (browser + node)
infra/                     # Self-hosted infra (Plane, Caddy)
e2e/                       # Playwright E2E tests
extension/                 # Browser extension
scripts/                   # Operational scripts
docs/                      # Project documentation
```

## Features

### Content

| Feature | Pages | Description |
|---|---|---|
| **Venues** | `/venues`, `/venues/:id` | LGBTQ+-friendly bars, clubs, restaurants, community spaces |
| **Events** | `/events`, `/events/:id` | Community events with date ranges and venue links |
| **Festivals** | `/festivals`, `/festivals/:id` | Festivals and pride celebrations |
| **Personalities** | `/personalities`, `/personalities/:id` | Notable LGBTQ+ figures with bios and linked content |
| **News** | `/news`, `/news/:id` | Aggregated LGBTQ+ news from RSS sources |
| **Marketplace** | `/marketplace` | Affiliate-aware product listings (Awin, Shopify, Etsy) |
| **Community Groups** | `/groups`, `/groups/:id` | User-created groups with membership and messaging |
| **Hotels** | `/hotels`, `/hotels/:id` | LGBTQ+-friendly hotel search with booking |
| **Queer Villages** | `/queer-villages` | Notable LGBTQ+ neighbourhoods worldwide |
| **Videos** | `/videos` | Community video content |

### Discovery

| Feature | Pages | Description |
|---|---|---|
| **Interactive Map** | `/map` | MapLibre GL with venue/event markers and area rendering |
| **City Pages** | `/cities/:slug` | City guides — venues, events, weather, safety |
| **Country Pages** | `/countries/:slug` | Country guides with ILGA legal data + safety ratings |
| **Resources / Tag Wiki** | `/resources`, `/resources/:tag` | Browseable tag taxonomy with linked content |
| **Travel** | `/travel` | Flight + hotel search, travel deals |
| **Search** | `/search` | Hybrid personalized search across all entity types |

### Community

User profiles, friends, direct messaging, feed, favourites, user-submitted venues/events.

### Admin

Admin pages require the `canManageContent` role: dashboard, CMS (Tiptap), import hub, security audit, analytics, workflow builder, content CRUD, tag management, pipeline observability.

## Architecture

### Search

Hybrid (keyword + semantic) personalized search with reranking. See [SEARCH_SYSTEM.md](SEARCH_SYSTEM.md).

```
Frontend ──► search-proxy (CF Worker)
                ├── AI Gateway → Workers AI (bge embed + reranker)
                ├── Meilisearch (multi-search, facets, geo, synonyms)
                └── Supabase RPC (pgvector ANN + bias signal + popular)

Supabase ──DB webhook──► search-ingest (CF Worker) ──► embeddings + Meili upsert
```

Indexes: `venues`, `events`, `cities`, `countries`, `news`, `marketplace`, `personalities`, `tags`, `queer_villages`.

### Pipelines

Workflow orchestration via `pgmq` + `workflow-dispatcher` edge function. Tables: `workflow_definitions`, `workflow_runs`. Queues: `scheduled_jobs`, `import_jobs`, `content_processing`, `dead_letter`. Exponential backoff, concurrency limits, idempotency keys.

`source-*` functions fetch raw data → `pipeline-*` functions normalize, validate, deduplicate, quality-score, gate, and commit. Visible at `/admin/pipelines` (Builder, Sources, Staging, Dedup audit).

**News pipeline** (cron `0 * * * *`): `source-rss-news` → `pipeline-normalize` → `pipeline-enrich-news` (LLM tags + summary + geo, circuit-broken) → `pipeline-validate` → `pipeline-deduplicate` → `pipeline-review-gate` → `pipeline-commit`. Idempotent commit via `news_commit_staging_batch` RPC, UNIQUE on `news_articles.fingerprint` (SHA-256 of normalized title + published day + source). Source health auto-managed: exp backoff (5min × 2ⁿ, cap 24h), auto-pause at 8 consecutive failures.

**Marketplace pipeline** (cron `0 4 * * *`, multi-source fan-in): `source-awin` + `source-shopify` + `source-etsy` → `fan-in` → `pipeline-normalize` → `pipeline-validate` → `marketplace-relevance` (Claude Haiku LGBTQ+ gate, < 0.5 confidence rejected) → `pipeline-deduplicate` → `pipeline-quality-score` → `pipeline-review-gate` → `pipeline-commit` → parallel `marketplace-image-mirror` + `embedding-generator`. Atomic commit with advisory lock + price-history delta. `price_usd` auto-computed from daily-refreshed `fx_rates` (23 currencies). Weekly `marketplace-link-checker` sweeps for link rot.

### Tag & resources system

Cross-content categorisation across the platform.

| Table / view | Purpose |
|---|---|
| `unified_tags` | All tags (name, slug, description, image, usage_count) |
| `tag_categories` | Hierarchical category tree |
| `tag_category_assignments` | Many-to-many tag-to-category with `is_primary` |
| `unified_tag_assignments` | Tag-to-entity mapping (venues, events, personalities, …) |
| `tag_suggestions` | AI-generated suggestions with confidence scores |

**AI pipeline:** `categorize-tags`, `auto-tag-content`, `bulk-create-ai-tags` — all load categories from DB at runtime.

**Frontend:** `src/pages/Ressources.tsx`, `src/components/resources/`, `src/components/tags/`, `src/hooks/useCentralizedTags.tsx`.

### Auth & security

- Supabase Auth (email/password, OAuth, passkeys)
- RLS on all tables; admin via `admin_roles.canManageContent`
- Cloudflare Turnstile on forms
- Audit logging for admin actions
- CSP / HSTS / X-Frame-Options via `wrangler.toml`

## Testing

- **Unit/component:** Vitest + @testing-library/react
- **E2E:** Playwright (`playwright.config.ts`)
- **Types:** `npx tsc --noEmit`

## Deployment

- **Frontend:** push to `main` → Cloudflare Pages auto-deploys
- **Edge functions:** `supabase functions deploy <name>`
- **Workers:** `wrangler deploy` per worker directory
- **DB migrations:** Supabase CLI / dashboard
- **Scraper:** GitHub Actions cron — daily full refresh + hourly events

## Compliance (scraper)

`robots.txt` checked per domain (1h cache), `Crawl-delay` honored, ≥3s polite delays + jitter. No anti-bot bypassing, no CAPTCHA solving, no login-walled sources. Per-source kill switches via `DISABLE_SOURCE_<NAME>=true`.
