# telegram-ingest

Cloudflare Worker that receives Telegram bot webhooks, mirrors media to R2,
and inserts rows into `community_submissions` for the social-media ingestion
pipeline.

## Endpoints

- `POST /webhook` — Telegram update receiver. Validates `X-Telegram-Bot-Api-Secret-Token`.
- `GET /health` — liveness probe.
- `GET /status` — recent submissions (Bearer `STATUS_TOKEN`).

## Setup

1. Create bot via [@BotFather](https://t.me/BotFather), get the token.
2. Set webhook:
   ```
   curl -F "url=https://telegram-ingest.<account>.workers.dev/webhook" \
        -F "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
        https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook
   ```
3. Configure secrets:
   ```
   wrangler secret put TELEGRAM_BOT_TOKEN
   wrangler secret put TELEGRAM_WEBHOOK_SECRET
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   wrangler secret put STATUS_TOKEN
   ```
4. Ensure `ingestion-media` R2 bucket exists. Otherwise update the binding in
   `wrangler.toml` to an existing bucket.
5. `wrangler deploy`.

## Behaviour

- text-only messages → `community_submissions` row with `raw_text`, no media.
- photos / videos / image documents → media mirrored to R2 under
  `telegram/<YYYY-MM-DD>/<chat_id>/<file_unique_id>.<ext>`.
- `permission_level='community_only'`, `sensitivity_level='community'`,
  `platform='telegram'`, `sub_source_type='forwarded'`.
- Replies in chat with the submission id.
- Webhook returns 200 even on error to avoid Telegram retry storms; errors are
  logged via `console.error` (visible in `wrangler tail`).
