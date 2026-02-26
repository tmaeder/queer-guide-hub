# Queer Guide

The global platform for LGBTQ+ travel, community, and safe spaces at [queer.guide](https://queer.guide).

## Tech Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS + MUI + shadcn/ui
- **State Management:** TanStack React Query
- **Backend:** [Supabase](https://supabase.com) (PostgreSQL 15, Edge Functions, Auth, Storage, Realtime)
- **Hosting:** Cloudflare Pages
- **Search:** PostgreSQL Full-Text Search with pg_trgm fuzzy matching + Algolia
- **Maps:** MapLibre GL with Protomaps basemaps + Mapbox geocoding
- **AI:** OpenAI GPT-4o-mini (tag categorisation, content tagging, RAG)
- **Analytics:** Umami self-hosted analytics
- **i18n:** i18next with 11 languages (ar, de, en, es, fr, it, ja, ko, pt, ru, zh)

## Local Development

Requirements: Node.js 18+ and npm.

```sh
# Install dependencies
npm install

# Start dev server
npm run dev
```

Available scripts:

| Script | Purpose |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run build:dev` | Development build |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest tests |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run preview` | Preview production build locally |

## Project Structure

```
src/
├── pages/              # Route-level page components (~90 pages)
├── components/         # Feature-grouped UI components
│   ├── admin/          # Admin dashboard components
│   ├── auth/           # Authentication flows
│   ├── city/           # City detail & listings
│   ├── cms/            # Content management system
│   ├── events/         # Events & festivals
│   ├── groups/         # Community groups
│   ├── home/           # Homepage
│   ├── hotels/         # Hotel search & detail
│   ├── layout/         # App shell, navigation, headers
│   ├── map/            # Interactive map components
│   ├── marketplace/    # Marketplace listings
│   ├── messaging/      # Direct messaging
│   ├── news/           # News articles
│   ├── personalities/  # LGBTQ+ personalities
│   ├── resources/      # Resources filter bar, tag list renderer
│   ├── search/         # Global search
│   ├── security/       # Security dashboard
│   ├── tags/           # Tag selector, related tags, graph
│   ├── travel/         # Flights, hotels, travel deals
│   ├── ui/             # Shared UI primitives (shadcn/ui)
│   ├── venues/         # Venue listings & detail
│   ├── villages/       # Queer villages / neighbourhoods
│   └── weather/        # Weather display
├── hooks/              # Custom React hooks
├── config/             # App configuration (navigation, map style, workflows)
├── i18n/               # Internationalisation (11 locales)
├── integrations/       # Third-party service clients (Supabase)
├── lib/                # Utility libraries
├── theme/              # MUI theme configuration
├── types/              # TypeScript type definitions
└── utils/              # Shared utility functions

supabase/
├── functions/          # 88 Supabase Edge Functions (Deno)
│   ├── _shared/        # Shared utilities (auth, scraping, AI validation)
│   └── ...             # Individual function directories
├── migrations/         # 409 PostgreSQL migration files
└── config.toml         # Supabase project configuration

scripts/                # Image generation & optimisation utilities
```

## Features

### Content

| Feature | Pages | Description |
|---|---|---|
| **Venues** | `/venues`, `/venues/:id` | LGBTQ+-friendly bars, clubs, restaurants, and community spaces with ratings, images, and amenities |
| **Events** | `/events`, `/events/:id` | Community events with date ranges, venue links, and target group filters |
| **Festivals** | `/festivals`, `/festivals/:id` | LGBTQ+ festivals and pride celebrations |
| **Personalities** | `/personalities`, `/personalities/:id` | Notable LGBTQ+ figures with bios, professions, and linked content |
| **News** | `/news`, `/news/:id` | Aggregated LGBTQ+ news from multiple sources |
| **Community Groups** | `/groups`, `/groups/:id` | User-created community groups with membership and messaging |
| **Marketplace** | `/marketplace` | Community marketplace for listings |
| **Hotels** | `/hotels`, `/hotels/:id` | LGBTQ+-friendly hotel search with booking integration |
| **Queer Villages** | `/queer-villages` | Notable LGBTQ+ neighbourhoods worldwide |
| **Videos** | `/videos` | Community video content |

### Discovery & Navigation

| Feature | Pages | Description |
|---|---|---|
| **Interactive Map** | `/map` | MapLibre GL map with venue/event markers and area rendering |
| **City Pages** | `/cities/:slug` | City guides with venues, events, weather, and safety info |
| **Country Pages** | `/countries/:slug` | Country guides with ILGA legal data and safety ratings |
| **Resources / Tag Wiki** | `/resources`, `/resources/:tag` | Browseable tag taxonomy with categories, search, and linked content |
| **Travel** | `/travel` | Flight search, hotel search, and travel deals |
| **Search** | `/search` | Global search across all content types |
| **Directory** | `/directory` | Comprehensive directory of LGBTQ+ resources |

### Community

| Feature | Pages | Description |
|---|---|---|
| **User Profiles** | `/profile/:id` | User profiles with privacy settings |
| **Friends** | `/friends` | Friend connections |
| **Messaging** | `/messages` | Direct messaging between users |
| **Feed** | `/feed` | Community feed / timeline |
| **Favourites** | `/favourites` | Saved venues, events, and content |
| **Submit Content** | `/submit-venue`, `/submit-event` | User-submitted venues and events |

### Admin

All admin pages require the `canManageContent` role.

| Feature | Path | Description |
|---|---|---|
| **Dashboard** | `/admin` | Overview with statistics and quick actions |
| **Content CMS** | `/admin/cms` | Rich text page editor (Tiptap) with dynamic routing |
| **Import Hub** | `/admin/import-hub` | Bulk data import from CSV, Foursquare, TripAdvisor, Eventbrite, Ticketmaster, etc. |
| **Security** | `/admin/security` | Audit logs, RLS policy monitoring, threat detection |
| **Analytics** | `/admin/analytics` | Umami analytics dashboard integration |
| **Workflows** | `/admin/workflows` | Background job orchestration with pgmq queues |
| **Content Management** | `/admin/venues`, `/admin/events`, etc. | CRUD management for all content types |
| **Tag Management** | `/admin/tags` | Tag wiki management with bulk operations |

## Architecture

### Tag & Resources System

The tag system powers the Resources page and cross-content categorisation across the platform.

**Database layer:**

| Table / View | Purpose |
|---|---|
| `unified_tags` | All tags with name, slug, description, image, usage_count |
| `tag_categories` | Hierarchical category tree (parent/child, sort_order) |
| `tag_category_assignments` | Many-to-many tag-to-category mapping with `is_primary` flag |
| `unified_tag_assignments` | Tag-to-entity mapping (venues, events, personalities, etc.) |
| `tag_suggestions` | AI-generated tag suggestions with confidence scores |
| `tag_usage_summary` (view) | Pre-aggregated usage counts per entity type |

**AI categorisation pipeline** (Supabase Edge Functions):

| Function | Role |
|---|---|
| `categorize-tags` | Batch-categorise uncategorised tags via GPT-4o-mini; loads categories from `tag_categories` table dynamically |
| `auto-tag-content` | Suggest tags for content items (venues, events, etc.) with confidence-based auto-approval |
| `bulk-create-ai-tags` | Create new tags from term lists with AI-generated descriptions and categories |

All three functions load category slugs from the DB at runtime and write to `tag_category_assignments` for multi-category support.

**Frontend:**

| Path | Purpose |
|---|---|
| `src/pages/Ressources.tsx` | Resources page orchestrator (view modes, routing, state) |
| `src/components/resources/` | Extracted sub-components: `ResourcesFilterBar`, `TagListRenderer`, `categoryMeta` |
| `src/hooks/useCentralizedTags.tsx` | React Query hook for cached tag+category data; also exports `useTagUsageCounts` |
| `src/components/tags/` | Reusable tag components: `TagSelector`, `RelatedTagsCard`, `TagLinkedContent`, `TagRelationshipGraph` |

### Edge Functions by Domain

88 Supabase Edge Functions organised by domain:

| Domain | Functions | Description |
|---|---|---|
| **Data Import** | `import-venues-csv`, `import-events-csv`, `import-foursquare-venues`, `import-google-places-venues`, `import-tripadvisor-venues`, `import-tomtom-venues`, `import-eventbrite-events`, `import-ticketmaster-events`, `import-city-data`, `import-country-data`, `import-airports-data`, `import-personalities-csv`, `import-tags-csv`, `import-kinktionary`, `import-awin-products`, `import-ilga-data`, `import-refuge-restrooms`, `import-adult-models-csv` | Bulk data import from CSV files and third-party APIs |
| **AI & Tagging** | `categorize-tags`, `auto-tag-content`, `bulk-create-ai-tags`, `intelligent-rag`, `populate-embeddings` | AI-powered categorisation, tagging, RAG, and vector embeddings |
| **Search** | `search`, `algolia-search`, `algolia-sync`, `search-gifs` | Full-text search, Algolia sync, and GIF search |
| **Travel** | `search-flights`, `search-hotels`, `travel-deals`, `resolve-origin-airport` | Flight and hotel search, travel deal aggregation |
| **Scraping** | `scrape-gaycities-events`, `scrape-spartacus`, `bulk-scrape-events`, `fetch-news`, `fetch-personality-data`, `fetch-wikipedia-data`, `fetch-city-images`, `fetch-ilga-data` | Web scraping and data enrichment from external sources |
| **Geo & Maps** | `mapbox-geocoding`, `secure-mapbox-proxy`, `secure-mapbox-token`, `secure-google-maps-key`, `geo-link-content`, `link-locations`, `resolve-or-create-city` | Geocoding, map tile proxying, and geographic content linking |
| **Media** | `get-pexels-images`, `store-tag-images`, `optimize-images-batch`, `scan-project-images`, `manage-placeholder-images`, `process-audio`, `process-video`, `reimport-personality-images` | Image/video/audio processing and optimisation |
| **Notifications & Email** | `send-bulk-email`, `send-templated-email`, `send-group-notifications`, `manage-email-templates` | Email delivery and push notifications |
| **Calendar** | `calendar-export`, `calendar-feed`, `calendar-token` | iCal export and calendar feed generation |
| **Weather** | `get-current-weather`, `get-weather-forecast` | Weather data for city pages |
| **Security** | `verify-turnstile`, `get-turnstile-config`, `secure-passkey-operations`, `manage-api-keys`, `get-api-key` | Turnstile CAPTCHA, passkey auth, API key management |
| **Caching** | `redis-get`, `redis-set`, `redis-delete`, `redis-keys` | Redis cache operations |
| **Infrastructure** | `cloudflare-api`, `redirect-handler`, `generate-sitemap`, `scan-links`, `validate-links`, `populate-optimization-status`, `workflow-dispatcher`, `background-import-manager`, `ingestion-pipeline`, `ingestion-review-api`, `enrich-venue`, `update-musician-concerts` | CDN management, SEO, link validation, and workflow orchestration |
| **Analytics** | `umami-analytics`, `umami-dashboard` | Self-hosted analytics integration |
| **Venues** | `get-refuge-restrooms` | Refuge Restrooms safe bathroom data |

### Auth & Security

- **Authentication:** Supabase Auth with email/password, OAuth, and passkey support
- **Authorisation:** Row Level Security (RLS) on all tables; admin roles via `admin_roles` table with `canManageContent` permission
- **Bot Protection:** Cloudflare Turnstile CAPTCHA on forms
- **Audit Trail:** Comprehensive audit logging for admin actions
- **Security Headers:** CSP, HSTS, X-Frame-Options configured in `wrangler.toml`

### Data Flow

```
External Sources (Foursquare, TripAdvisor, Eventbrite, etc.)
        │
        ▼
  Edge Functions (import-*, scrape-*, fetch-*)
        │
        ▼
  PostgreSQL (unified_tags, venues, events, etc.)
        │
        ├──▶ AI Pipeline (categorize-tags, auto-tag-content)
        │         │
        │         ▼
        │    tag_category_assignments, tag_suggestions
        │
        ▼
  React Query Cache (useCentralizedTags, useTagUsageCounts, etc.)
        │
        ▼
  React Components (Resources page, Venue detail, etc.)
```

## Testing

- **Unit & Component Tests:** Vitest + @testing-library/react
- **E2E Tests:** Playwright (configured in `playwright.config.ts`)
- **Type Checking:** `npx tsc --noEmit`

## Architecture

### Tag & Resources System

The tag system powers the Resources page and cross-content categorisation across the platform.

**Database layer:**

| Table / View | Purpose |
|---|---|
| `unified_tags` | All tags with name, slug, description, image, usage_count |
| `tag_categories` | Hierarchical category tree (parent/child, sort_order) |
| `tag_category_assignments` | Many-to-many tag-to-category mapping with `is_primary` flag |
| `unified_tag_assignments` | Tag-to-entity mapping (venues, events, personalities, etc.) |
| `tag_suggestions` | AI-generated tag suggestions with confidence scores |
| `tag_usage_summary` (view) | Pre-aggregated usage counts per entity type |

**AI categorisation pipeline** (Supabase Edge Functions):

| Function | Role |
|---|---|
| `categorize-tags` | Batch-categorise uncategorised tags via GPT-4o-mini; loads categories from `tag_categories` table dynamically |
| `auto-tag-content` | Suggest tags for content items (venues, events, etc.) with confidence-based auto-approval |
| `bulk-create-ai-tags` | Create new tags from term lists with AI-generated descriptions and categories |

All three functions load category slugs from the DB at runtime and write to `tag_category_assignments` for multi-category support.

**Frontend:**

| Path | Purpose |
|---|---|
| `src/pages/Ressources.tsx` | Resources page orchestrator (view modes, routing, state) |
| `src/components/resources/` | Extracted sub-components: `ResourcesFilterBar`, `TagListRenderer`, `categoryMeta` |
| `src/hooks/useCentralizedTags.tsx` | React Query hook for cached tag+category data; also exports `useTagUsageCounts` |
| `src/components/tags/` | Reusable tag components: `TagSelector`, `RelatedTagsCard`, `TagLinkedContent`, `TagRelationshipGraph` |

## Deployment

Deployments are automatic via Cloudflare Pages on push to `main`.

Edge Functions are deployed to Supabase and configured in `supabase/config.toml`.
