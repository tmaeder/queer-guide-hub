#!/usr/bin/env bash
# Nightly Plane backup → Cloudflare R2
#
# Run path: /opt/plane/infra/plane/backup/backup.sh (invoked by systemd timer)
# Uses env vars from ../env (loaded below).
#
# What it does:
#   1. pg_dump Plane's Postgres into a compressed file
#   2. upload dump to s3://$BACKUP_R2_BUCKET/postgres/YYYY/MM/DD/
#   3. mirror R2 assets bucket → backup bucket (server-side copy via rclone sync)
#   4. prune local dumps older than 7 days; R2 lifecycle rule handles the rest
#
# Exit codes: 0 ok; non-zero = alert (see systemd OnFailure=).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLANE_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PLANE_DIR"

# Load .env
set -a
# shellcheck disable=SC1091
source .env
set +a

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DAY_PATH="$(date -u +%Y/%m/%d)"
LOCAL_DIR="/var/backups/plane"
mkdir -p "$LOCAL_DIR"

DUMP_FILE="$LOCAL_DIR/plane-$STAMP.sql.gz"

echo "[$(date -Is)] starting backup"

# 1. Postgres dump from inside the db container (no host pg_client needed)
docker compose exec -T plane-db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=plain --no-owner --no-privileges \
  | gzip -9 > "$DUMP_FILE"

SIZE=$(stat -c%s "$DUMP_FILE")
echo "[$(date -Is)] dump size: $SIZE bytes → $DUMP_FILE"

# 2. Upload to R2 via rclone (config provisioned by install step in README)
rclone copy "$DUMP_FILE" "r2-backups:${BACKUP_R2_BUCKET}/postgres/${DAY_PATH}/" \
  --s3-no-check-bucket --progress

# 3. Mirror object assets (R2→R2 cross-bucket copy)
rclone sync "r2-assets:${AWS_S3_BUCKET_NAME}" "r2-backups:${BACKUP_R2_BUCKET}/assets/latest" \
  --fast-list --s3-no-check-bucket

# 4. Local retention: 7 days
find "$LOCAL_DIR" -name 'plane-*.sql.gz' -mtime +7 -delete

echo "[$(date -Is)] backup complete"
