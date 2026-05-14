# Rotate Secrets

## Supabase edge function secrets

1. Generate new value
2. Update in Supabase:
   ```bash
   npx supabase secrets set SECRET_NAME=new_value --project-ref xqeacpakadqfxjxjcewc
   ```
3. All functions automatically pick up the new value on next invocation

## Key secrets to track

| Secret | Used by | Rotation trigger |
|--------|---------|-----------------|
| RESEND_API_KEY | send-*-email | Suspected compromise |
| OPENAI_API_KEY | pipeline-enrich-*, embedding-generator | Monthly or on leak |
| PEXELS_API_KEY | fetch-images | On leak |
| UNSPLASH_ACCESS_KEY | fetch-images | On leak |
| SENTRY_DSN | All functions (via _shared/sentry.ts) | Never (public) |
| STRIPE_SECRET_KEY | create-checkout-session, stripe-webhook | On leak |
| STRIPE_WEBHOOK_SECRET | stripe-webhook | If endpoint recreated |
| MEILI_MASTER_KEY | meilisearch-sync, search-proxy worker | On compromise |
| API_ERROR_SECRET | ingest-api-error | On leak |

## Cloudflare Workers secrets

```bash
cd workers/search-proxy
wrangler secret put MEILI_API_KEY
```

## Frontend (.env)

Only `VITE_*` vars are public (bundled into client JS). Rotate via Cloudflare Pages dashboard > Settings > Environment variables.
