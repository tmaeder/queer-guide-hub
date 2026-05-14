#!/usr/bin/env bash
# Restore Plane from an R2 backup dump.
#
# Usage:
#   ./restore.sh s3://qg-plane-backups/postgres/2026/04/23/plane-20260423T030000Z.sql.gz
#   ./restore.sh /var/backups/plane/plane-20260423T030000Z.sql.gz
#
# DESTRUCTIVE: drops and recreates the Plane database. Confirms twice.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLANE_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PLANE_DIR"

set -a; source .env; set +a

SRC="${1:?usage: restore.sh <dump-path-or-r2-url>}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Restoring Plane DB from: $SRC"
echo "This will DROP the existing '$POSTGRES_DB' database. Type DESTROY to continue:"
read -r confirm
[[ "$confirm" == "DESTROY" ]] || { echo "aborted"; exit 1; }

if [[ "$SRC" == s3://* || "$SRC" == r2-backups:* ]]; then
  DEST="$TMP/$(basename "$SRC")"
  rclone copyto "${SRC/s3:\/\//r2-backups:}" "$DEST"
else
  DEST="$SRC"
fi

echo "Stopping app services (leaving DB running)…"
docker compose stop web space admin api worker beat-worker live proxy

echo "Dropping and recreating database…"
docker compose exec -T plane-db psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS $POSTGRES_DB;"
docker compose exec -T plane-db psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;"

echo "Loading dump…"
gunzip -c "$DEST" | docker compose exec -T plane-db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "Starting services…"
docker compose up -d

echo "Restore complete. Watch: docker compose logs -f api"
