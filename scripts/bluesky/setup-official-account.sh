#!/usr/bin/env bash
# One-time setup for the official Queer Guide Bluesky account.
# Prompts for the handle and an APP PASSWORD (Bluesky → Settings → Privacy and
# security → App passwords — never the main password), then:
#   1. stores them as Supabase secrets for the bluesky-bot-post edge function
#   2. publishes the "Queer Guide" feed generator record
# Prints the account DID; that goes into Cloudflare Pages as FEED_PUBLISHER_DID.
set -euo pipefail
cd "$(dirname "$0")/../.."

read -rp "Bluesky handle (e.g. queerguide.bsky.social): " BLUESKY_HANDLE
read -rsp "App password (hidden): " BLUESKY_APP_PASSWORD
echo

supabase secrets set --project-ref xqeacpakadqfxjxjcewc \
  "BLUESKY_BOT_HANDLE=$BLUESKY_HANDLE" \
  "BLUESKY_BOT_APP_PASSWORD=$BLUESKY_APP_PASSWORD"

BLUESKY_HANDLE="$BLUESKY_HANDLE" BLUESKY_APP_PASSWORD="$BLUESKY_APP_PASSWORD" \
  node scripts/bluesky/publish-feed-generator.mjs
