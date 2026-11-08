# Queer Guide

[Queer Guide](https://queer.guide) is an LGBTQ+ community and travel guide for finding events, venues, news, and places to visit.

## Local development

Use Node.js 22 or newer. The repository pins a version in [`.nvmrc`](.nvmrc).

```sh
npm ci
cp .env.example .env
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` using the notes in [`.env.example`](.env.example). Then run `npm run dev` and open [localhost:8080](http://localhost:8080).

| Command             | Purpose                         |
| ------------------- | ------------------------------- |
| `npm run build`     | Build the web app               |
| `npm run lint`      | Run ESLint                      |
| `npm run typecheck` | Check for new TypeScript errors |
| `npm test`          | Run unit and component tests    |
| `npm run test:e2e`  | Run Playwright browser tests    |

## Repository guide

| Path                       | What lives there                                         |
| -------------------------- | -------------------------------------------------------- |
| [`src/`](src/)             | React and Vite web app                                   |
| [`supabase/`](supabase/)   | PostgreSQL migrations and Deno Edge Functions            |
| [`functions/`](functions/) | Cloudflare Pages middleware, sitemaps, and page metadata |
| [`workers/`](workers/)     | Cloudflare Workers, including search and ingestion       |
| [`scraper/`](scraper/)     | Data source adapters and scraping pipeline               |
| [`extension/`](extension/) | Browser extension for submitting venues and events       |
| [`mobile/`](mobile/)       | Native mobile app                                        |

See the [documentation index](docs/README.md) for architecture, design, testing, and operations. For vulnerability reporting, see the [security policy](SECURITY.md).
