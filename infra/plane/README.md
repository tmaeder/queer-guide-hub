# Plane on `plane.queer.guide`

Self-hosted Plane Community Edition — the central internal workspace for
queer.guide. This directory contains everything needed to provision, run,
back up, and restore the deployment.

**Live URL:** https://plane.queer.guide
**Host:** Infomaniak Public Cloud VM (Ubuntu 24.04)
**Ingress:** Cloudflare Tunnel (no public ports)
**Object storage:** Cloudflare R2 (S3-compatible) — bucket `qg-plane-assets`
**Backups:** Cloudflare R2 — bucket `qg-plane-backups`, nightly 03:00 UTC
**Auth:** Google OAuth + magic-link invite (signups disabled)

---

## 1. Contents

| Path | Purpose |
|---|---|
| `docker-compose.yml` | Plane stack (api, web, space, admin, live, workers, proxy, db, redis, mq) + cloudflared sidecar |
| `.env.example` | All required env vars; copy to `.env` on the VM |
| `cloudflared/config.yml` | Reference tunnel config for credentials-file mode |
| `backup/backup.sh` | Nightly Postgres dump + asset mirror → R2 |
| `backup/restore.sh` | Destructive restore from a dump file |
| `systemd/plane.service` | Boots the compose stack on VM start |
| `systemd/plane-backup.{service,timer}` | 03:00 UTC daily backup |

---

## 2. First-time setup (runbook)

Run through once to go live. Every step is manual on purpose — the steps
touch external accounts (Infomaniak, Cloudflare, Google) and secrets.

### 2.1 Provision the VM (Infomaniak Public Cloud)

1. In the Infomaniak Manager → Public Cloud → create an OpenStack project
   if none exists.
2. Launch instance:
   - Image: **Ubuntu 24.04 LTS**
   - Flavor: **a4-ram8-disk80** (4 vCPU / 8 GB RAM / 80 GB) — minimum
   - SSH key: upload your public key; disable password auth
   - Security group: allow inbound **SSH (22) only**, and only from your admin IPs
3. Note the public IPv4 — but **no DNS record points to it** (Cloudflare
   Tunnel avoids exposing the IP).

### 2.2 Harden the VM

SSH in as `ubuntu`, then:

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y unattended-upgrades fail2ban ufw rclone curl gnupg ca-certificates
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <YOUR_ADMIN_IP> to any port 22 proto tcp
sudo ufw enable
sudo systemctl enable --now fail2ban unattended-upgrades

# Non-root user
sudo adduser --system --group --home /opt/plane --shell /bin/bash plane
sudo usermod -aG docker plane   # after Docker is installed below
```

### 2.3 Install Docker

```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker plane
```

### 2.4 Cloudflare DNS + Tunnel

In Cloudflare Zero Trust dashboard:

1. **Networks → Tunnels → Create a tunnel** (name: `plane-queer-guide`).
2. Choose **Cloudflared**, copy the **tunnel token** (the long string
   starting with `eyJ…`). Paste it into `.env` as `CLOUDFLARE_TUNNEL_TOKEN`.
3. **Public Hostname** tab → add:
   - Subdomain: `plane`
   - Domain: `queer.guide`
   - Service: `HTTP` → `plane-proxy:80`
4. Cloudflare auto-creates the `plane` CNAME in DNS; verify in
   **DNS → Records** for zone `queer.guide`.

No orange-cloud toggle needed — Tunnel traffic is always proxied.

### 2.5 Cloudflare R2

In Cloudflare dashboard → **R2**:

1. Create two buckets: `qg-plane-assets` (private), `qg-plane-backups` (private).
2. On `qg-plane-backups`: **Settings → Object lifecycle rules → Add** →
   "Delete objects after 30 days" under prefix `postgres/`.
3. **Manage R2 API Tokens → Create Token**:
   - Token 1 (app): Permissions "Object Read & Write", scope to `qg-plane-assets` only.
   - Token 2 (backup): Permissions "Object Read & Write", scope to `qg-plane-backups` AND "Object Read" on `qg-plane-assets`.
4. Note the **Account ID** (shown on R2 page) → becomes `<ACCOUNT_ID>` in endpoint URL.

Fill `.env` variables `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY`, both endpoint URLs.

Store both tokens in 1Password under `queer.guide / Plane / R2 tokens`.

### 2.6 Google OAuth

Reuse the existing queer.guide GCP project (same one that supplies
Supabase Auth's Google client):

1. GCP Console → APIs & Services → Credentials → open the OAuth 2.0 Client used by queer.guide.
2. Under **Authorized redirect URIs**, add:
   `https://plane.queer.guide/auth/google/callback`
3. Save. No new client needed. Copy the existing client ID + secret into
   `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### 2.7 SMTP

Infomaniak Mail provides SMTP for any `@queer.guide` mailbox.
Create (or reuse) a `plane@queer.guide` mailbox in kSuite, then paste
credentials into `.env` (`EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`).

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

Open https://plane.queer.guide → the **admin** instance-setup screen appears
on first visit.

1. Create the instance admin account (use your real Google email).
2. In instance admin: disable email/password signup; enable Google OAuth
   (client ID/secret come from `.env`, already injected).
3. Log out, log back in via Google.
4. Create workspace **`queer.guide`** with URL slug `queer-guide`.
5. Create projects + labels + views per section 4 below.
6. Invite the rest of the admin team by email (magic-link arrives via SMTP).

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
| 1Password vault | `queer.guide / Plane / *` (secrets, R2 tokens, SMTP, OAuth) |
| GitHub Actions | not used for Plane (manual deploy) |
| Cloudflare Tunnel token | CF Zero Trust dashboard + `.env` |
| Google OAuth client | shared with queer.guide main app (GCP Console) |

**Break-glass:** if the VM is lost, a fresh VM + latest R2 backup restores
full state in < 30 min. Only the `.env` must be re-populated from 1Password.

---

## 6. Auth model & SSO upgrade path

v1 uses **Google OAuth** with the same Google Workspace account admins use
for queer.guide. Plane and queer.guide maintain separate user records, but
because both trust the same Google identity, UX is "click Sign in with
Google" in either app — no second password.

Full SSO (single session, single user record) would require either:

- **Plane Enterprise license** + a small Cloudflare Worker acting as an
  OIDC provider that delegates to Supabase GoTrue and signs ID tokens; or
- Verify current Plane CE version supports generic OIDC (recent releases
  have added this). If yes: same Worker shim, no license needed.

This upgrade is deferred; ~1 day of work once decided.

**Apple Sign-In note:** queer.guide offers Apple OAuth; Plane CE does not.
Admins who use only Apple must sign in to Plane via Google or be invited
via magic-link email.

---

## 7. Known risks & tradeoffs

- **Single VM, no HA.** Accepted for an internal tool. RPO ≈ 24 h (daily
  dump), RTO ≈ 30 min (restore from R2).
- **Plane upgrades occasionally ship breaking migrations.** Always dump
  before bumping `PLANE_VERSION`; read release notes.
- **Cloudflare Tunnel single point of failure.** If CF is down, Plane is
  unreachable. Acceptable — most of our stack depends on CF anyway.
- **No cross-app SSO in v1.** See section 6 for upgrade path.
