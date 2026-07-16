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

## 5. Mail — team inboxes (contact@ / support@ / legal@ / press@)

Turns the public team addresses into two-way CRM inboxes. Twenty can only sync a
**real IMAP mailbox** (it rejects forwarding aliases), and queer.guide mail is on
Cloudflare Email Routing (forwarding-only). So a self-hosted **Stalwart** mail
server runs in this stack; the `team-inbox` Cloudflare Email Worker imports
inbound mail into it over the tunnel; outbound goes through **Resend**. Zero extra
cost, no new open ports.

```
sender → CF Email Routing rule → team-inbox Worker → JMAP import → Stalwart mailbox
Twenty ⇄ IMAP 993 / SMTP 587 (internal alias mail.queer.guide) ⇄ Stalwart
Twenty replies → Stalwart → Resend smarthost → internet
Twenty system email (EMAIL_DRIVER=SMTP) → Resend
```

### 5a. .env + bring up Stalwart
Add to `.env`: `STALWART_ADMIN_SECRET=$(openssl rand -base64 24)` and
`RESEND_API_KEY=<same key Supabase uses>`. Then:
```bash
sudo docker compose up -d stalwart worker server
```
The `worker` now runs with `DISABLE_CRON_JOBS_REGISTRATION=false` (messaging sync
jobs) and both services have `OUTBOUND_HTTP_SAFE_MODE_ENABLED=false` (so Twenty may
reach Stalwart on the private network — see the security note below).

### 5b. Configure Stalwart
Follow [`stalwart/README.md`](stalwart/README.md): add the `queer.guide` domain,
enable **ACME (Cloudflare DNS-01)** for a valid `mail.queer.guide` cert, create the
four mailbox accounts, and set the **Resend smarthost** relay. Record each mailbox
password — you need it in 5d and 5e.

### 5c. Cloudflare — tunnel hostname + Email Routing rules
1. **Tunnel** (Zero Trust → your `twenty-nas` tunnel → Public Hostnames → Add):
   subdomain `mail`, domain `queer.guide`, **Service** = `HTTP` → `stalwart:8080`.
   (Optionally put Cloudflare Access in front — the worker still authenticates with
   the mailbox credentials.)
2. **Email Routing** (queer.guide zone → Email → Routing rules): add one
   **custom address** rule per team address — `contact@`, `support@`, `legal@`,
   `press@` — action **Send to a Worker → team-inbox**. These specific rules take
   priority over the apex catch-all, so the per-user `travel-inbox` worker is
   untouched. Leave apex MX / SPF / DMARC as-is.

### 5d. Deploy the team-inbox worker
```bash
cd ../../../workers/team-inbox   # from infra/twenty/nas
npm ci
# JSON map of local-part → the Stalwart password you set in 5b:
wrangler secret put STALWART_MAILBOX_PASSWORDS
#   {"contact":"…","support":"…","legal":"…","press":"…"}
npm run deploy
```
Bind the four Email Routing rules from 5c to this worker in the dashboard (Cloudflare
does not bind Email Routing addresses from `wrangler.toml`).

### 5e. Connect the inboxes in Twenty
Settings → Accounts → **Add account → IMAP/SMTP/CalDAV**, once per mailbox:
- IMAP host `mail.queer.guide` port `993` (SSL), SMTP host `mail.queer.guide` port
  `587` (STARTTLS), username `contact@queer.guide` (etc.) + its password.
- Sync **INBOX** only (exclude Spam/Trash). Also flip **Settings → Lab →
  IMAP/SMTP/CalDAV** on if the connector isn't visible.

### 5f. Verify end-to-end
1. `sudo docker compose logs stalwart | grep -i password` (first-boot admin) and IMAP
   login test (see `stalwart/README.md`).
2. Send a real email to `contact@queer.guide` → `wrangler tail queer-guide-worker-team-inbox`
   shows the import → the message appears in the `contact@` INBOX.
3. In Twenty it shows as a Message thread within ~5 min (auto-linked to the sender
   Person/Company). Reply from Twenty → recipient receives it (via Resend); a Sent
   copy is in the mailbox.
4. Trigger a Twenty invite/notification → delivered via Resend.
5. Repeat the inbound test for `support@ / legal@ / press@`.

### Security note — SSRF safe mode
`OUTBOUND_HTTP_SAFE_MODE_ENABLED=false` disables Twenty's guard against outbound
connections to private IPs — **required** because Stalwart is on the private docker
network. It also relaxes the guard for webhooks / HTTP-workflow actions, so only
workspace admins should define those. Acceptable here: single-admin workspace on an
isolated stack. Do not expose Twenty's workflow/webhook builder to untrusted users
while this is off.
