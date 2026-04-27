# Plane on `plane.queer.guide`

Self-hosted Plane Community Edition — the central internal workspace for
queer.guide. This directory contains everything needed to provision, run,
back up, and restore the deployment.

**Live URL:** https://plane.queer.guide
**Host:** existing queer.guide Infomaniak VPS (co-located)
**Ingress:** Cloudflare Tunnel (no public ports)
**Object storage:** Cloudflare R2 (S3-compatible) — bucket `qg-plane-assets`
**Backups:** Cloudflare R2 — bucket `qg-plane-backups`, nightly 03:00 UTC
**Mail:** Resend SMTP (`smtp.resend.com`)
**Auth:** magic-link email invite only, signups disabled

---

## 1. Contents

| Path | Purpose |
|---|---|
| `docker-compose.yml` | Plane stack (api, web, space, admin, live, workers, proxy, db, redis, mq); joins shared `web` network for Caddy |
| `.env.example` | All required env vars; copy to `.env` on the VPS |
| `backup/backup.sh` | Nightly Postgres dump + asset mirror → R2 |
| `backup/restore.sh` | Destructive restore from a dump file |
| `systemd/plane.service` | Boots the compose stack on VPS start |
| `systemd/plane-backup.{service,timer}` | 03:00 UTC daily backup |

---

## 2. First-time setup (runbook)

Assumes Plane is co-located on the **existing queer.guide VPS** that already
runs Meilisearch + Caddy (`meilisearch/docker-compose.yml`). No new
VM, no Cloudflare Tunnel — traffic flows Internet → Caddy:443 → `plane-proxy:80`
over a shared Docker network `web`.

### 2.1 Prep the existing VPS

SSH in as the existing admin user. Install any missing packages:

```bash
sudo apt update
sudo apt install -y rclone
# Docker + docker-compose-plugin already installed for Meilisearch.
```

Create a non-root owner for Plane (keeps volumes + .env file ownership clean):

```bash
sudo adduser --system --group --home /opt/plane --shell /bin/bash plane
sudo usermod -aG docker plane
```

### 2.2 Create the shared docker network

One-time, idempotent:

```bash
docker network inspect web >/dev/null 2>&1 || docker network create web
```

### 2.3 Attach Caddy + Meilisearch to the shared network

Edit the existing `meilisearch/docker-compose.yml` on the VPS to add
the `web` network to the `caddy` service, then restart it:

```yaml
# meilisearch/docker-compose.yml  (caddy service only)
  caddy:
    image: caddy:2-alpine
    container_name: caddy
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    networks: [default, web]

networks:
  default:
  web:
    external: true
```

Append the Plane site block to the existing `Caddyfile`:

```caddyfile
plane.queer.guide {
  reverse_proxy plane-proxy:80
  encode zstd gzip
  # Plane's live collab uses websockets — Caddy auto-detects Upgrade headers.

  # Force no-cache on every response. Plane serves a SPA with hashed assets but
  # the root HTML and /api/* responses MUST NOT be cached — stale HTML pinned
  # to an old bundle hash produces hard-to-debug 404s on chunk loads. Override
  # upstream Cache-Control so CF edge + browser never cache app shell / API.
  header_down >Cache-Control "private, no-store, no-cache, must-revalidate"
}
```

> **Cloudflare Cache Rules — must be disabled for `plane.queer.guide`.**
> The queer.guide zone ships with four default "Cache Everything [Template]"
> / "Set Browser/Edge Cache Time" rules (slots #3–#6 in **Caching → Cache
> Rules**). These cache the Plane SPA HTML at the CF edge and cause stale
> bundles after every deploy. Either scope them to exclude
> `hostname eq "plane.queer.guide"`, or toggle them off. Verified absent as
> of the initial cutover — re-check after any CF zone template migration.

Reload:

```bash
cd meilisearch
docker compose up -d    # picks up the new network
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### 2.4 Cloudflare DNS

Cloudflare → queer.guide zone → DNS → Add record:

- Type: `A`
- Name: `plane`
- IPv4: existing VPS public IP (the one `search.queer.guide` / `s.queer.guide`
  already points at)
- Proxy status: **DNS only** (grey cloud) — Caddy handles TLS end-to-end
  with Let's Encrypt; CF proxying would double-terminate.
- TTL: Auto

### 2.5 Cloudflare R2

Buckets `qg-plane-assets` and `qg-plane-backups` are already created
(account `7aa3765cc5f50f2b681b782eb4a8d296`); lifecycle rule
`expire-postgres-30d` on `qg-plane-backups` (prefix `postgres/`, 30d) is
live.

Still to do, in **R2 → Manage R2 API Tokens → Create Account API Token**:

- **Token 1 — `plane-app`**: permission "Object Read & Write", scope to
  bucket `qg-plane-assets` only. Paste access key ID + secret into `.env`
  as `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.
- **Token 2 — `plane-backup`**: permission "Object Read & Write" on
  `qg-plane-backups`, "Object Read" on `qg-plane-assets`. Paste into
  `.env` as `BACKUP_R2_ACCESS_KEY_ID` / `BACKUP_R2_SECRET_ACCESS_KEY`.

Endpoint URL for both: `https://7aa3765cc5f50f2b681b782eb4a8d296.r2.cloudflarestorage.com`

Store both token secrets in 1Password under `queer.guide / Plane / R2 tokens`.

**CORS policy on `qg-plane-assets` (required for browser attachment
uploads):** Plane's frontend presigns a POST to R2 and the browser uploads
the file bytes directly. Without a CORS policy the preflight fails and
attachments silently never reach the bucket. Set this in
**R2 → qg-plane-assets → Settings → CORS Policy** (paste as compact
single-line JSON — the CodeMirror editor auto-inserts braces on pretty-
printed input and rejects it):

```json
[{"AllowedOrigins":["https://plane.queer.guide"],"AllowedMethods":["GET","PUT","POST","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]
```

Verify: `curl -i -X OPTIONS -H "Origin: https://plane.queer.guide" -H "Access-Control-Request-Method: POST" https://7aa3765cc5f50f2b681b782eb4a8d296.r2.cloudflarestorage.com/qg-plane-assets`
must return `204` with `Access-Control-Allow-Origin: https://plane.queer.guide`.

### 2.6 Auth (magic-link only, no OAuth)

No OAuth providers. Admins authenticate exclusively via one-time magic-link
emails delivered through Resend. `ENABLE_SIGNUP=0` ensures only explicitly
invited emails can register.

### 2.7 SMTP (Resend)

1. In Resend dashboard (https://resend.com):
   - **Domains** → verify `queer.guide` (add the shown CNAME/TXT records in
     Cloudflare DNS for the `queer.guide` zone; propagation is typically < 5 min).
   - **API Keys** → create a key named `plane-smtp` with "Sending access" scope
     only. Copy the value once; it won't be shown again.
2. Paste the API key into `.env` as `EMAIL_HOST_PASSWORD`. SMTP host is
   `smtp.resend.com`, user is the literal string `resend`, port 465 SSL.
3. The `From:` address `plane@queer.guide` does not require an Infomaniak
   mailbox — Resend signs outbound mail with the verified domain's DKIM.

### 2.8 Deploy

```bash
sudo -iu plane
cd /opt/plane
git clone https://github.com/<org>/QG.git .   # or sparse-checkout only infra/plane
cd infra/plane
cp .env.example .env
chmod 600 .env
vim .env    # paste every REPLACE_ME value

# Pre-create rclone config
mkdir -p ~/.config/rclone
cat > ~/.config/rclone/rclone.conf <<EOF
[r2-assets]
type = s3
provider = Cloudflare
access_key_id = ${AWS_ACCESS_KEY_ID}
secret_access_key = ${AWS_SECRET_ACCESS_KEY}
endpoint = ${AWS_S3_ENDPOINT_URL}
region = auto

[r2-backups]
type = s3
provider = Cloudflare
access_key_id = ${BACKUP_R2_ACCESS_KEY_ID}
secret_access_key = ${BACKUP_R2_SECRET_ACCESS_KEY}
endpoint = ${BACKUP_R2_ENDPOINT}
region = auto
EOF

docker compose pull
docker compose up -d
docker compose logs -f migrator   # wait until "migration complete", then Ctrl+C
docker compose ps                 # all services healthy
```

### 2.9 Enable systemd units

```bash
sudo cp systemd/plane.service /etc/systemd/system/
sudo cp systemd/plane-backup.service /etc/systemd/system/
sudo cp systemd/plane-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now plane.service plane-backup.timer
systemctl list-timers plane-backup.timer   # next run visible
```

### 2.10 First-run Plane config (via UI)

Open https://plane.queer.guide → the **instance-setup** screen appears on first visit.

1. Create the instance admin account using your primary queer.guide email.
   A magic-link is emailed via Resend; click it to activate.
2. In instance admin (`…/god-mode/general`): ensure `ENABLE_SIGNUP=0`
   and OAuth providers are empty (already set via `.env`).
3. Create workspace **`queer.guide`** with URL slug `queer-guide`.
4. Create projects + labels + views per section 4 below.
5. Invite the rest of the admin team by email — each receives a magic-link
   to set up their account.

---

## 3. Day-to-day operations

### Update Plane
```bash
sudo -iu plane
cd /opt/plane/infra/plane
./backup/backup.sh                        # fresh dump before upgrade
sed -i 's/^PLANE_VERSION=.*/PLANE_VERSION=vX.Y.Z/' .env
docker compose pull
docker compose up -d
docker compose logs -f api
```
Read upstream release notes first: https://github.com/makeplane/plane/releases

### Add / remove an admin
Instance admin UI: **Workspaces → queer.guide → Members**. Invite by email
(they receive a magic link) or have them sign in with Google first then
promote their role.

### Rotate secrets
1. Generate new values (e.g. `openssl rand -hex 32` for `SECRET_KEY`).
2. Edit `.env`.
3. `docker compose up -d --force-recreate`.
4. Update 1Password vault `queer.guide / Plane / secrets`.

For R2 tokens: create new token in CF dashboard, swap in `.env`, restart,
then delete the old token.

### Manual backup
```bash
sudo -u plane /opt/plane/infra/plane/backup/backup.sh
```

### Restore
```bash
sudo -u plane /opt/plane/infra/plane/backup/restore.sh \
  s3://qg-plane-backups/postgres/2026/04/22/plane-20260422T030000Z.sql.gz
```

### Check health
```bash
docker compose ps
docker compose logs --tail=100 api
systemctl status plane-backup.timer
journalctl -u plane-backup.service --since '2 days ago'
```

---

## 4. Initial workspace structure

Workspace: **queer.guide**

| Project | Purpose | Labels |
|---|---|---|
| Product | Roadmap, specs, product decisions | `feature`, `ux`, `content-schema`, `ops` |
| Engineering | worker, web, scraper, search-proxy | `worker`, `web`, `scraper`, `search`, `infra`, `bug`, `tech-debt` |
| Content & Data | Imports, QA, source onboarding | `import`, `qa`, `source`, `partnership` |
| Operations | Legal, finance, hiring, infra ops | `legal`, `finance`, `ops`, `security` |
| Community & Partnerships | Outreach, events, press | `outreach`, `event`, `press` |
| Ideas & Backlog | Global parking lot; triaged monthly | `idea`, `research`, `triaged` |

**Statuses (all projects):** Backlog → Todo → In Progress → Review → Done (+ Cancelled).

**Views (all projects):** *My Issues*, *This Cycle*, *Blocked*, *Needs Triage*.

**Pages** (per project, under Pages tab): Decision Log, Runbooks,
Onboarding, Partner Contacts, Weekly Notes.

---

## 5. Secrets inventory

| Secret | Location |
|---|---|
| `.env` on VM | `/opt/plane/infra/plane/.env`, mode 0600, owner `plane` |
| 1Password vault | `queer.guide / Plane / *` (DB, RabbitMQ, Django secret, Resend API key, R2 tokens, tunnel token) |
| GitHub Actions | not used for Plane (manual deploy) |
| Cloudflare Tunnel token | CF Zero Trust dashboard + `.env` |
| Resend API key | Resend dashboard + `.env` (`EMAIL_HOST_PASSWORD`) |

**Break-glass:** if the VM is lost, a fresh VM + latest R2 backup restores
full state in < 30 min. Only the `.env` must be re-populated from 1Password.

---

## 6. Auth model

**Magic-link email only.** No OAuth providers. `ENABLE_SIGNUP=0` so only
explicitly invited emails can register. Links are delivered via Resend SMTP
from `plane@queer.guide`.

**Shared identity with queer.guide:** Plane and queer.guide are independent
user stores. Admins sign in with the same email address in both apps, so
identity is logically unified even though the records are separate. This is
the simplest and most reliable approach given our stack — Supabase is an
OAuth consumer only, not an OIDC provider, so real SSO would require
adding an IdP (Keycloak/Authentik) or Plane Enterprise + a Supabase→OIDC
shim Worker. Deferred; revisit only if admin count grows significantly.

**Adding / removing admins:**
- Add: instance admin UI → Workspaces → `queer.guide` → Members → Invite by email.
- Remove: same UI, set role to Guest or remove member.
- First-ever admin is created on first page load at the instance-setup screen.

---

## 7. Known risks & tradeoffs

- **Single VM, no HA.** Accepted for an internal tool. RPO ≈ 24 h (daily
  dump), RTO ≈ 30 min (restore from R2).
- **Plane upgrades occasionally ship breaking migrations.** Always dump
  before bumping `PLANE_VERSION`; read release notes.
- **Cloudflare Tunnel single point of failure.** If CF is down, Plane is
  unreachable. Acceptable — most of our stack depends on CF anyway.
- **Separate user stores.** No automatic sync of roles/members between
  queer.guide and Plane; admins are invited manually per app.
