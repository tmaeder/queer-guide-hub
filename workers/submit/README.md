# worker-submit

Cloudflare Worker that accepts authenticated content suggestions from the
queer.guide Chrome extension and stages them in Supabase
`ingestion_staging` for the existing pipeline (normalize → dedupe →
quality-score → review-gate → commit).

## Endpoints

- `POST /submit` — body: `SubmitBody`, header: `Authorization: Bearer <supabase JWT>`
  - Verifies the JWT against `SUPABASE_JWT_SECRET` (HS256).
  - Rate-limits: `SUBMISSION_RATE_PER_MIN` per user (default 10) via KV.
  - Hashes payload (matching [staging-publisher.ts](../scraper/src/db/staging-publisher.ts) `stableStringify`).
  - Upserts on `(source_type, source_entity_id, payload_hash)` so resubmitting the same page is idempotent.
  - Returns `{ submission_id, disposition, rate_limit_remaining }`.
- `GET /submissions/:id` — own submission status (RLS scoped to caller via service-key query).
- `GET /health`

## Setup

```bash
cd worker-submit
npm install

# secrets
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put SUPABASE_JWT_SECRET

# KV namespace
wrangler kv:namespace create RATE_LIMIT
# put the id into wrangler.toml

# migrate the DB (use Supabase CLI or MCP — supabase is gitignored)
# applies Dev/src/db/migrations/002_user_submissions.sql

npm run deploy
```

## Tests

```bash
npm test
```

Covers the stable-hash equivalence with the scraper's publisher and the
zod request schema.
