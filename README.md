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

## Deployment

Deployments are automatic via Cloudflare Pages on push to `main`.
