# Twenty on the NAS + Cloudflare Tunnel

Hosts Twenty on the UGREEN NAS (always-on Docker host) and exposes it at
`crm.queer.guide` via a Cloudflare Tunnel — **no open ports**, Cloudflare TLS, domain
stays in the existing Cloudflare account. This is the "existing infra" answer: your
Cloudflare + your NAS.

## Prereqs
- UGOS → **App Center**: install **Docker**. SSH enabled (Control Panel → Terminal/SSH).
- ~4 GB free RAM (server + worker + Postgres + Redis).

## 1. Create the Cloudflare Tunnel (dashboard, one-time)
Cloudflare **Zero Trust** → **Networks → Tunnels → Create a tunnel** → *Cloudflared* →
name it `twenty-nas`:
1. On **Install connector**, copy the **token** (the long string after `--token`). → `TUNNEL_TOKEN`.
2. **Public Hostnames → Add**: subdomain `crm`, domain `queer.guide`, **Service** =
   `HTTP` → `server:3000`. (The `queer.guide` zone must be on this Cloudflare account —
   it is.) Save. Cloudflare auto-creates the `crm` DNS record.

## 2. Deploy on the NAS
```bash
# on the NAS (SSH):
mkdir -p ~/twenty && cd ~/twenty
# copy this docker-compose.yml + .env here (or git-clone the repo and cd infra/twenty/nas)
cp .env.example .env
# fill: ENCRYPTION_KEY=$(openssl rand -base64 32), PG_DATABASE_PASSWORD=<strong>, TUNNEL_TOKEN=<from step 1>
sudo docker compose up -d
# first boot runs ~180 metadata/migration steps before :3000 answers (~5-8 min):
curl -s http://127.0.0.1:3000/healthz   # -> {"status":"ok"}
```
If the `worker` bailed while the server was still booting: `sudo docker compose up -d worker`.

## 3. Verify the tunnel
`https://crm.queer.guide` should load the Twenty signup. In Zero Trust the tunnel shows
**Healthy**. Complete the workspace wizard (admin account) + create an API key
(Settings → API & Webhooks).

## 4. Wire the queer.guide sync (done by Claude / operator)
```bash
supabase secrets set TWENTY_API_URL=https://crm.queer.guide TWENTY_API_KEY=<key>
supabase functions deploy twenty-sync
# smoke test, then schedule the cron — see ../../../docs/integrations/twenty-crm-sync.md
```
The `externalId` custom fields (Company + Person) must exist on the hosted instance too —
create via Settings → Data Model, or the Metadata API (see the main runbook).

## Notes
- `restart: always` + NAS uptime = Twenty and the tunnel survive reboots.
- Optional: point Twenty file storage at the existing R2 bucket (uncomment the S3 block
  in `.env.example`) instead of the NAS volume.
- Keep the stack on Twenty's official images; check upstream before bumping `TAG`.
