#!/usr/bin/env bash
# Prompts for the official account's handle and app password (hidden), then
# publishes the guide.queer.* lexicon schemas to it.
set -euo pipefail
cd "$(dirname "$0")/../.."
read -rp "Bluesky handle (e.g. queerguide.bsky.social): " BLUESKY_HANDLE
read -rsp "App password (hidden): " BLUESKY_APP_PASSWORD
echo
BLUESKY_HANDLE="$BLUESKY_HANDLE" BLUESKY_APP_PASSWORD="$BLUESKY_APP_PASSWORD" \
  node scripts/bluesky/publish-lexicons.mjs
