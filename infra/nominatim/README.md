# Self-hosted Nominatim on `nominatim.queer.guide`

Internal-only reverse-geocoder. Replaces public Nominatim for
`pipeline-geo-validate` and any future geocoding worker, removing the
1 req/sec rate limit that made the venue backfill impractical.

**Live URL:** https://nominatim.queer.guide (internal — Supabase egress IPs only)
**Host:** existing queer.guide Infomaniak VPS (co-located with Caddy + Plane + Meilisearch)
**Ingress:** Caddy on shared `web` Docker network (no host port published)
**Auth:** IP allowlist for Supabase eu-central-2 egress + HTTP basic-auth fallback
**Data:** Geofabrik Europe extract, weekly OSM replication

---

## 1. Sizing

| Region scope | Raw PBF | Imported DB | Import time (4 vCPU/8 GB) |
|---|---|---|---|
| **Europe-only (default)** | ~28 GB | ~60 GB | ~4 hr |
| Europe + N. America | ~40 GB | ~95 GB | ~7 hr |
| Europe + N. America + AU/NZ + key Asia | ~52 GB | ~120 GB | ~10 hr |
| Full planet | ~80 GB | ~250 GB | 1–2 days |

Default is Europe-only. Most QG venues are European; expand later if mismatch backlog warrants.

---

## 2. First-time setup

### 2.1 Prep VPS (free disk, shared network)

SSH to the existing VPS as the `plane` user (already has docker group).

```bash
df -h /opt    # need ≥ 80 GB free for default Europe scope
docker network inspect web >/dev/null || docker network create web
```

If `df` shows < 80 GB free, grow the VPS disk in Infomaniak Manager first.

### 2.2 Clone + env

```bash
sudo -iu plane
cd /opt/plane
# QG repo already cloned for Plane; pull latest
git -C QG pull origin main
cd QG/infra/nominatim
cp .env.example .env
chmod 600 .env

# Generate Postgres password
sed -i "s/REPLACE_ME$/$(openssl rand -hex 32)/" .env

# Generate basic-auth password (for ad-hoc curl bypass of IP allowlist)
docker run --rm caddy:2-alpine caddy hash-password --plaintext "$(openssl rand -base64 24)"
# Paste output bcrypt hash + the cleartext into 1Password vault
# `queer.guide / Nominatim / basic-auth`. Set:
#   NOMINATIM_BASIC_AUTH_HASH=<bcrypt>
# in .env.
```

### 2.3 Caddyfile

Append the contents of `Caddyfile.snippet` to the existing
`/opt/plane/QG/Dev/web/meilisearch/Caddyfile` on the VPS, then reload Caddy:

```bash
docker compose -f /opt/plane/QG/Dev/web/meilisearch/docker-compose.yml \
  exec caddy caddy reload --config /etc/caddy/Caddyfile
```

> **Supabase egress IPs:** the snippet hardcodes the eu-central-2 ranges
> as of 2026-04-26. Re-check via the Supabase API
> (`/v1/projects/{ref}/network-restrictions`) every quarter and after any
> Supabase region migration. Wrong CIDRs = silent 403s for the edge fn.

### 2.4 Cloudflare DNS

Cloudflare → queer.guide zone → DNS:
- Type: `A`
- Name: `nominatim`
- IPv4: existing VPS public IP (same as `plane.queer.guide`)
- Proxy: **DNS only** (grey cloud) — Caddy terminates TLS

### 2.5 Initial import

The first `up` triggers a full PBF download + import. **Allow ~4 hours**
for Europe; do not Ctrl+C — the container handles its own retry on
mid-import failure but a kill leaves the volume in an unrecoverable
half-imported state.

```bash
cd /opt/plane/QG/infra/nominatim
docker compose pull
docker compose up -d
docker compose logs -f nominatim   # follow until "Import complete"
```

When the log shows `Import complete` (and the healthcheck flips to
healthy), test from outside the VPS:

```bash
curl -u qg:<basic-auth-cleartext> \
  'https://nominatim.queer.guide/reverse?format=json&lat=52.52&lon=13.405&zoom=10&addressdetails=1'
# → JSON with display_name "Berlin, ..."
```

### 2.6 Enable systemd

```bash
sudo cp /opt/plane/QG/infra/nominatim/systemd/nominatim.service /etc/systemd/system/
sudo cp /opt/plane/QG/infra/nominatim/systemd/nominatim-update.service /etc/systemd/system/
sudo cp /opt/plane/QG/infra/nominatim/systemd/nominatim-update.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nominatim.service nominatim-update.timer
systemctl list-timers nominatim-update.timer
```

### 2.7 Update edge function to point here

Set Supabase project secret:

```bash
supabase secrets set NOMINATIM_URL=https://nominatim.queer.guide \
  NOMINATIM_BASIC_AUTH="qg:<basic-auth-cleartext>" \
  --project-ref xqeacpakadqfxjxjcewc
```

The `pipeline-geo-validate` function reads `NOMINATIM_URL` (falls back to
public Nominatim if unset) and adds `Authorization: Basic ...` if
`NOMINATIM_BASIC_AUTH` is set. Once secrets are in place, redeploy:

```bash
supabase functions deploy pipeline-geo-validate \
  --project-ref xqeacpakadqfxjxjcewc
```

Then drop the rate-limit sleep from 1100ms to ~50ms in `index.ts` (own
infra, no public Nominatim policy applies). Smoke-test:

```sql
SELECT net.http_post(
  url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-geo-validate',
  headers := jsonb_build_object('Content-Type','application/json',
                                'Authorization','Bearer <anon-jwt>'),
  body := '{"batch_size":50,"only_new":false}'::jsonb,
  timeout_milliseconds := 60000
);
-- Should return ~50 validated in <5 seconds (vs ~55s before)
```

### 2.8 Backfill historic venues

Once the function is fast, run a one-shot backfill of every venue:

```sql
-- Loop: 50 venues per call, until pipeline returns validated=0
DO $$
DECLARE v_resp jsonb; v_validated int;
BEGIN
  LOOP
    SELECT content::jsonb INTO v_resp
    FROM net._http_response WHERE id = (
      SELECT net.http_post(
        url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-geo-validate',
        headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon-jwt>"}'::jsonb,
        body := '{"batch_size":50,"only_new":false}'::jsonb,
        timeout_milliseconds := 60000
      )
    );
    v_validated := (v_resp->>'validated')::int;
    EXIT WHEN v_validated = 0;
    RAISE NOTICE 'validated %', v_validated;
  END LOOP;
END $$;
```

At 50 venues × 50ms ≈ 2.5 s/batch × 631 batches ≈ 26 min wall-clock for
all 31,524 venues.

---

## 3. Day-to-day operations

### Add a region (after initial Europe import)

Switch to merged regional PBF — requires a fresh import (4-10 hr).
There's no incremental "add region" path in Nominatim.

```bash
# On VPS: build merged PBF with osmium-tool (apt install osmium-tool).
mkdir -p /opt/plane/nominatim-import && cd /opt/plane/nominatim-import
for r in europe north-america australia-oceania; do
  curl -O https://download.geofabrik.de/$r-latest.osm.pbf
done
osmium merge europe-latest.osm.pbf north-america-latest.osm.pbf \
  australia-oceania-latest.osm.pbf -o merged.osm.pbf

# Update docker-compose.yml: replace PBF_URL with file:///merged/merged.osm.pbf
# and mount the merged file. Then:
docker compose down -v   # WIPES the old DB
docker compose up -d
```

### Replication health
```bash
docker exec nominatim sudo -u nominatim nominatim status
docker exec nominatim sudo -u nominatim nominatim replication --once   # manual catch-up
journalctl -u nominatim-update.service --since '2 weeks ago'
```

### Restart / restore
- Soft restart: `docker compose restart nominatim`
- Hard reset (re-import from PBF): `docker compose down -v && docker compose up -d`
  (4 hr downtime — only as last resort)

### Monitor disk
```bash
docker system df -v | grep nominatim
df -h /var/lib/docker
```

---

## 4. Known risks & tradeoffs

- **Single VPS, no HA.** Nominatim down → `pipeline-geo-validate` falls
  back to `nominatim.openstreetmap.org` (1 req/sec) automatically. Daily
  cron only does 30 venues/run, so ~33s under fallback — acceptable.
- **Replication occasionally drifts.** If the weekly `nominatim
  replication --once` falls behind by > 7 days, the next run might
  reject the diff. Recovery: catch-up with multiple `--once` calls.
- **Disk growth.** OSM grows ~5%/year. Re-check `df -h` quarterly; bump
  VPS disk before > 85 % full.
- **Geofabrik availability.** Single source for both initial PBF and
  diffs. If Geofabrik goes away long-term, switch to
  `download.openstreetmap.fr` (different URL scheme, requires updated
  REPLICATION_URL).
- **Result quality vs. public Nominatim.** Identical — same dataset,
  same software. Only difference is rate limit.
