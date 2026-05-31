# workers/

Cloudflare Workers — edge services deployed independently of the SPA.

What lives here (one dir each, own `wrangler` config + `.dev.vars`):
- `search-proxy` (Meilisearch proxy, holds the API key), `ingest` (search-intelligence pipeline), `submit` (extension submissions → `ingestion_staging`), `snapshot-archiver` (editorial snapshots), `image-cdn` / `image-ingest` (R2-backed image delivery + ingestion), `geo` (geolocation), `trip-inbox` (trip inbox slots).

Conventions:
- Develop with `wrangler dev`, deploy with `wrangler deploy` from the worker's own directory.
- Secrets live in `.dev.vars` (local) / Wrangler secrets (prod) — never commit them.
