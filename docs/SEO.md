# SEO

How queer.guide ships SEO-correct HTML to crawlers from a SPA. Read this before adding routes, changing the rendering path, or touching anything under `functions/_lib/`.

## Architecture

The SPA (`src/`) renders client-side and ships an empty `<div id="root"></div>` to the browser. A Cloudflare Pages Function (`functions/_middleware.ts`) sits in front of every HTML response and rewrites the head + body before the browser sees it.

```
crawler / browser
       │
       ▼
Cloudflare Pages
       │
       ├─ /api/*, static assets ─────────────────► passthrough
       │
       └─ HTML routes ─► functions/_middleware.ts
                                │
                                ├─ resolveDetailRoute(env, path)  [Phase 3]
                                │     └─ Supabase REST → row
                                │
                                ├─ resolveMeta(path)               [Phase 1]
                                │     └─ static route table (functions/_lib/routeMeta.ts)
                                │
                                └─ HTMLRewriter
                                      ├─ <title>, <meta description>
                                      ├─ append canonical, OG/Twitter, JSON-LD
                                      └─ if isBot(UA): replace #root children
                                                       (functions/_lib/routeBody.ts
                                                        or detail.body)
```

Real users get the SPA shell unchanged (head only). Crawlers get the same shell *plus* injected body content. React 18's `createRoot()` discards children on mount, so the SPA still hydrates cleanly even when Googlebot's JS-rendering pass runs.

## Where to make changes

| You want to… | Edit |
|---|---|
| Change the title/description for `/foo` | `functions/_lib/routeMeta.ts` (`STATIC_ROUTE_META`) |
| Change the body content shown to crawlers for `/foo` | `functions/_lib/routeBody.ts` (`STATIC_ROUTE_BODY`) |
| Mark a path as `noindex,nofollow` | `functions/_lib/routeMeta.ts` (`isIndexable()`) |
| Change which detail tables/columns we read | `functions/_lib/detail.ts` |
| Change the JSON-LD shape for a detail type | `functions/_lib/detail.ts` (per-type builder) |
| Add a new bot user agent | `functions/_lib/botUa.ts` (`BOT_UA_TOKENS`) |
| Add a new sitemap | `functions/sitemap-*.xml.ts` + register in `functions/sitemap.xml.ts` |
| Change the homepage Organization / WebSite schema | `functions/_lib/jsonLd.ts` |

## Adding a new public route

1. Add the route to the SPA (under `src/`) as usual.
2. Add an entry to `STATIC_ROUTE_META` in `functions/_lib/routeMeta.ts`. Keep title ≤ 60 chars, description ≤ 155 chars.
3. Optionally add an entry to `STATIC_ROUTE_BODY` in `functions/_lib/routeBody.ts` with an `h1`, 2–3 paragraphs, and internal links. If you skip this, the route falls back to a generic template.
4. Add the route to the `ROUTES` array in `scripts/seo-check.mjs` so CI verifies it.
5. If the route is part of a new content type (not just a marketing page), also add a sub-sitemap under `functions/sitemap-<type>.xml.ts` and register it in `functions/sitemap.xml.ts`.

## Detail pages

Detail routes follow the pattern `/<type>/:slug`. Supported types and their tables:

| Pattern | Table | Schema.org @type |
|---|---|---|
| `/venues/:slug` | `venues` | `LocalBusiness` / `BarOrPub` / `CafeOrCoffeeShop` / `NightClub` / `Restaurant` / `LodgingBusiness` / `Store` (mapped from `venue_subtype`) |
| `/events/:slug` | `events` | `Event` |
| `/news/:slug` | `news_articles` | `NewsArticle` |
| `/personalities/:slug` | `personalities` | `Person` |
| `/city/:slug` | `cities` | `Place` + `ItemList` of top venues |
| `/country/:slug` | `countries` | `Country` |
| `/hotels/:slug` | `hotels` | `LodgingBusiness` |
| `/villages/:slug` | `queer_villages` | `TouristDestination` |
| `/tags/:slug` | `unified_tags` | `DefinedTerm` |

## i18n / hreflang

Routes are mounted under an optional `/:locale?` segment in `src/routes.tsx`. The default locale (`en`) is served at the root path; the other ten get a two-letter prefix (`/de`, `/fr`, `/es`, `/pt`, `/it`, `/ru`, `/zh`, `/ja`, `/ko`, `/ar`).

The middleware strips the locale prefix before resolving meta and detail routes, then emits `<link rel="alternate" hreflang="...">` for every supported locale plus `x-default`. Each locale variant is its own self-canonical. Update the locale list in `functions/_lib/routeMeta.ts` (`SUPPORTED_LOCALES`) if you add or drop a language — keep it in sync with `src/i18n/languages.ts`.

To add a new detail type:

1. Confirm the table has `slug` and `updated_at` columns.
2. Add a per-type builder in `functions/_lib/detail.ts` returning `{ meta, body, jsonLd }`.
3. Add the dispatch line in `resolveDetailRoute()`.
4. Add a sub-sitemap (`functions/sitemap-<type>.xml.ts`) and register in `functions/sitemap.xml.ts`.

## Required Pages env vars

Set on the Cloudflare Pages project (`queer-guide`) under Settings → Environment variables, for both Production and Preview:

- `SUPABASE_URL` = `https://xqeacpakadqfxjxjcewc.supabase.co`
- `SUPABASE_ANON_KEY` (RLS-respecting; safe to set) **or** `SUPABASE_SERVICE_ROLE_KEY`

Without these, the dynamic sitemaps return an empty `<urlset>` and detail pages fall back to slug-derived static metadata. The static sitemap and Phase 1/2 head rewriting still work.

## Landing pages

Some URLs don't exist as SPA routes — handing them to the SPA would render 404, which is a cloaking risk if we then served different content to bots. For these we serve a complete standalone HTML response from the middleware (bypassing `next()`):

| Pattern | Source | Schema.org @type |
|---|---|---|
| `/spaces/:tag` | `venues` filtered by `tags` | `ItemList` + `BreadcrumbList` |
| `/pride/:year` | `events` where `event_type=pride` for the given year | `BreadcrumbList` |
| `/pride/:year/:city` | `events` filtered by `event_type=pride` + `city_id` | `BreadcrumbList` |

Identity tag list, supported Pride year range, and the per-tag editorial copy live in `functions/_lib/landing.ts` (`IDENTITY_TAGS`, `PRIDE_YEAR_MIN`, `PRIDE_YEAR_MAX`). Add new identity tags by editing that file.

These pages are HTML-only (no JS, minimal inline CSS). Every link is a regular `<a href>` to a real SPA route, so users land back in the SPA on the next click.

## CI guardrails

| Workflow | Trigger | Asserts |
|---|---|---|
| `seo-check.yml` | After every Pages deploy + daily 06:00 UTC | Per-route title uniqueness, length bounds, canonical correctness, og:image absoluteness, JSON-LD on `/`, hreflang count, bot-UA `<h1>` injection |
| `lighthouse.yml` | After every Pages deploy + Mondays 07:00 UTC | Lighthouse scores for performance/a11y/SEO/best-practices on 6 key routes. Reports uploaded as artifacts. |
| `sitemap-freshness.yml` | Daily 05:00 UTC | Each sub-sitemap returns 200, has ≥ N entries, freshest `<lastmod>` ≤ 14 days old |
| `search-console-report.yml` | Mondays 08:00 UTC | Pulls top queries / pages / totals from the GSC API and commits a markdown report to `reports/seo-weekly-YYYY-WW.md`. Skips with exit 78 if `GOOGLE_SERVICE_ACCOUNT_KEY` and `SEARCH_CONSOLE_PROPERTY` secrets aren't set. |

All workflows accept a `workflow_dispatch` invocation so you can run them on demand.

### Wiring up Search Console reporting

1. Create a Google Cloud service account.
2. In Search Console → Settings → Users and permissions, grant the service account's email "Full" access on the property.
3. Add two repository secrets: `GOOGLE_SERVICE_ACCOUNT_KEY` (the full JSON, single line) and `SEARCH_CONSOLE_PROPERTY` (e.g. `sc-domain:queer.guide`).
4. The next Monday run produces `reports/seo-weekly-YYYY-WW.md`. The workflow has `permissions: contents: write` and commits the report itself.

## Submitting to search engines

After major sitemap changes, submit `https://queer.guide/sitemap.xml` to:

- Google Search Console → Sitemaps
- Bing Webmaster Tools → Sitemaps

Both then crawl the index and fan out to per-type sitemaps automatically.

## Cloaking note

We serve different *body content* to bots vs. humans (humans get the SPA shell; bots get pre-rendered content). Google's policy permits UA-targeted serving when the bot-served content faithfully represents what the rendered SPA shows for the same route. Our injected content is always a subset of what the SPA renders — no keyword stuffing, no redirects, no hidden text. This is content parity, not cloaking.

If you change body content, keep that contract. The H1 and key facts the crawler sees should also appear (visually or programmatically) for real users when the SPA renders.

## Common pitfalls

- **iCloud blob eviction.** This repo lives in an iCloud-synced folder. `.git` blob objects can be evicted, causing `git checkout` to silently leave files at stale versions. If you branch off `origin/main` and see surprising diffs, run `git fetch origin main` (forces blob fetch) before branching, or `brctl download .git` from a parent path inside the iCloud library.
- **Adding `<meta>` tags to `index.html`.** The middleware *appends* head tags rather than replacing, so `index.html` provides defaults (the *first* tag) but the middleware-injected version (the *last* tag) wins per crawler precedence. Don't fight the middleware in `index.html` — change `routeMeta.ts` instead.
- **Per-route caching.** Detail pages set `Cache-Control: public, s-maxage=300` and `Vary: User-Agent`. If you're debugging stale content on the edge, purge via the Cloudflare API or wait 5 minutes.
- **Forgetting `seo-check.mjs`.** When you add a route, add it to `ROUTES` in `scripts/seo-check.mjs` so CI catches regressions.
