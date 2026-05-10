# Meilisearch Deployment

Self-hosted Meilisearch for queer.guide search.

## Setup

1. Copy `.env.example` to `.env` and set `MEILI_MASTER_KEY` (min 16 chars)
2. Set `MEILI_DOMAIN` to your domain
3. Point DNS A record to server IP
4. `docker compose up -d`

Caddy auto-provisions HTTPS via Let's Encrypt.

## Generate API Keys

After first start, create a search-only key:

```bash
curl -X POST "https://${MEILI_DOMAIN}/keys" \
  -H "Authorization: Bearer ${MEILI_MASTER_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Search-only key for CF Worker",
    "actions": ["search"],
    "indexes": ["*"],
    "expiresAt": null
  }'
```

## Indexes

11 indexes synced from Supabase: venues, events, cities, countries, news, marketplace, personalities, tags, hotels, queer_villages, festivals.
