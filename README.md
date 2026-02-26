# Queer Guide

The global platform for LGBTQ+ travel, community, and safe spaces at [queer.guide](https://queer.guide).

## Tech Stack

- **Frontend:** Vite + React + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** [Supabase](https://supabase.com) (PostgreSQL, Edge Functions, Auth, Storage)
- **Hosting:** Cloudflare Pages
- **Search:** PostgreSQL Full-Text Search with pg_trgm fuzzy matching

## Local Development

Requirements: Node.js 18+ and npm.

```sh
# Install dependencies
npm install

# Start dev server
npm run dev
```

## Building

```sh
npm run build
```

Output goes to `dist/`.

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
