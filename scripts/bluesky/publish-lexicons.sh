#!/usr/bin/env bash
# Prompts for the official account's handle and app password (hidden), then
# publishes the guide.queer.* lexicon schemas to it.
set -euo pipefail
cd "$(dirname "$0")/../.."
read -rp "Bluesky handle [queerguide.bsky.social]: " BLUESKY_HANDLE
BLUESKY_HANDLE="${BLUESKY_HANDLE:-queerguide.bsky.social}"
BLUESKY_APP_PASSWORD=""
while [ -z "$BLUESKY_APP_PASSWORD" ]; do
  read -rsp "App password for @$BLUESKY_HANDLE (hidden, paste then Enter): " BLUESKY_APP_PASSWORD
  echo
  [ -z "$BLUESKY_APP_PASSWORD" ] && echo "Nothing was entered — paste the app password and press Enter."
done
BLUESKY_HANDLE="$BLUESKY_HANDLE" BLUESKY_APP_PASSWORD="$BLUESKY_APP_PASSWORD" \
  node scripts/bluesky/publish-lexicons.mjs
