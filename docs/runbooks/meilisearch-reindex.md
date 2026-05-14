# Meilisearch Reindex

## Full reindex (all indexes)

Trigger via GitHub Actions:

1. Go to Actions > "Meili direct resync + country backfill"
2. Click "Run workflow"
3. Enable venues + events checkboxes as needed

Or manually:
```bash
bash scripts/meili-direct-resync.sh venues
bash scripts/meili-direct-resync.sh events
```

## Reconfigure indexes (settings, synonyms, aliases)

Trigger via GitHub Actions:

1. Go to Actions > "Reconfigure Meilisearch"
2. Click "Run workflow"
3. Optionally enable "seed city aliases"

This SSHes into the VPS and runs `configure-indexes.sh`.

## Incremental sync

Handled automatically by `meilisearch-sync` edge function, triggered by pg_net on row changes.

Force a manual sync:
```bash
curl -X POST "https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/meilisearch-sync" \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{"full_sync": true, "index": "venues"}'
```

## Health check

```bash
curl -s https://s.queer.guide/health | jq .
curl -s https://s.queer.guide/stats | jq '.indexes | to_entries[] | {key: .key, docs: .value.numberOfDocuments}'
```

## VPS access

```bash
ssh <user>@<host>  # credentials in GitHub Secrets (INFOMANIAK_SSH_*)
docker compose -f /opt/meilisearch/docker-compose.yml logs --tail 50
```
