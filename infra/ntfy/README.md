# Self-hosted ntfy on `ntfy.queer.guide`

Replaces the Web Push (VAPID) end-user notification channel — trip
reminders and DM alerts — with self-hosted push via
[ntfy](https://github.com/binwiederhier/ntfy). Self-hosting (rather than
the public ntfy.sh) matters here because DM/match notification content
is sensitive for an LGBTQ+ app: ntfy topics are world-readable by
default unless ACL'd, and a public server's topic names aren't secret.

**Live URL:** https://ntfy.queer.guide (public — publish/subscribe/WS
needs to reach users' phones and browsers worldwide; only the
account-provisioning endpoints are restricted, see §2.3)
**Host:** existing queer.guide Infomaniak VPS (co-located with Caddy +
Plane + Nominatim)
**Ingress:** Caddy on shared `web` Docker network (no host port
published)
**Auth model:** server-wide `auth-default-access: deny-all`; one ntfy
account + reserved topic per Supabase user, provisioned over HTTP via
ntfy's own Account API (`/v1/account`, `/v1/account/reservation`,
`/v1/account/token`) — no custom shim service needed, this all runs on
the same VPS as nominatim/plane.

---

## 1. First-time setup

### 1.1 Prep VPS (shared network already exists)

```bash
sudo -iu plane
cd /opt/plane/QG
git pull origin main
docker network inspect web >/dev/null || docker network create web
```

### 1.2 Env + bootstrap secrets

```bash
cd /opt/plane/QG/infra/ntfy
cp .env.example .env
chmod 600 .env

# Basic-auth for the /v1/account* provisioning path (ad-hoc admin curl
# from a laptop; see §2.3 — the real callers are the Supabase edge
# functions, this is just a manual-debugging fallback).
docker run --rm caddy:2-alpine caddy hash-password --plaintext "$(openssl rand -base64 24)"
# Paste output bcrypt hash + the cleartext into 1Password vault
# `queer.guide / ntfy / basic-auth`. Set NTFY_ADMIN_BASIC_AUTH_HASH in .env.
```

### 1.3 Caddyfile

Append `Caddyfile.snippet` to the existing
`/opt/plane/QG/Dev/web/meilisearch/Caddyfile`, then reload:

```bash
docker compose -f /opt/plane/QG/Dev/web/meilisearch/docker-compose.yml \
  exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### 1.4 Cloudflare DNS

Cloudflare → queer.guide zone → DNS:
- Type: `A`
- Name: `ntfy`
- IPv4: existing VPS public IP (same as `nominatim.queer.guide` /
  `plane.queer.guide`)
- Proxy: **DNS only** (grey cloud) — Caddy terminates TLS, and this
  sidesteps any Cloudflare-proxy buffering/timeout concerns on ntfy's
  long-lived WebSocket subscriber connections entirely.

### 1.5 Start ntfy

```bash
cd /opt/plane/QG/infra/ntfy
docker compose pull
docker compose up -d
docker compose logs -f ntfy   # until healthy
curl https://ntfy.queer.guide/v1/health   # {"healthy":true}
```

### 1.6 Bootstrap the publisher account

The `ntfy-dispatcher` edge function needs one write-only credential that
can publish to *any* user's topic (`qg-u-*`), separate from the
per-user read-only accounts that `ntfy-provision` creates on demand.
Create it once, manually, from the VPS:

```bash
docker exec ntfy ntfy user add --role=user qg-publisher
docker exec ntfy ntfy access qg-publisher 'qg-u-*' write-only
docker exec ntfy ntfy token add qg-publisher
# → copy the printed token into 1Password (queer.guide / ntfy / qg-publisher)
```

### 1.7 Wire Supabase secrets

```bash
supabase secrets set \
  NTFY_SERVER_URL=https://ntfy.queer.guide \
  NTFY_PUBLISHER_TOKEN=<token from 1.6> \
  --project-ref xqeacpakadqfxjxjcewc
```

Deploy `ntfy-provision`, `ntfy-revoke`, and `ntfy-dispatcher` (see
project root `supabase/functions/`) once they exist. `VAPID_PUBLIC` /
`VAPID_PRIVATE` / `VAPID_SUBJECT` secrets and the `web-push` dependency
stay in place until the cutover's Phase 2 (see project plan).

### 1.8 Verify per-user provisioning end to end

Confirm the Account API actually works on the pinned image version
before wiring the edge function against it (`enable-reservations` is a
newer ntfy feature — check `docker exec ntfy ntfy --version` against
current ntfy docs if this fails):

```bash
curl -s -u nobody:x -X POST https://ntfy.queer.guide/v1/account \
  -d '{"username":"qg-test","password":"'"$(openssl rand -base64 18)"'"}' \
  -H "Authorization: Basic $(echo -n qg:<NTFY_ADMIN_BASIC_AUTH cleartext> | base64)"
# then reserve a topic + mint a token for qg-test the same way
# ntfy-provision will, and confirm a subscribe (wscat or the ntfy app)
# only sees messages published to that exact topic.

# Clean up the test account:
docker exec ntfy ntfy user del qg-test
```

### 1.9 Enable systemd

```bash
sudo cp /opt/plane/QG/infra/ntfy/systemd/ntfy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ntfy.service
```

---

## 2. Day-to-day operations

### Inspect a user's ACL / revoke access

```bash
docker exec ntfy ntfy user list
docker exec ntfy ntfy access <ntfy_username>
docker exec ntfy ntfy user del <ntfy_username>   # full revoke
```

### Restart / restore

- Soft restart: `docker compose restart ntfy`
- The `ntfy-data` volume holds `user.db` (all accounts/ACLs/tokens) and
  `cache.db` (recent messages, for reconnect catch-up) — back this up
  before any host migration; losing it means every user must re-opt-in.

### Health

```bash
curl https://ntfy.queer.guide/v1/health
docker compose logs --tail 100 ntfy
```

---

## 3. Known risks & tradeoffs

- **Single VPS, no HA.** ntfy down → no push delivery at all (unlike
  Nominatim, there's no public fallback for a private, ACL'd topic
  scheme). Acceptable for a best-effort notification channel; not for
  anything safety-critical.
- **Android background delivery is best-effort.** This instance has no
  Firebase/FCM relay configured, so the native ntfy Android app depends
  on its own foreground service surviving battery optimization — a
  real, disclosed limitation vs. browser Web Push (which piggybacks on
  FCM/APNs invisibly). Mitigate in onboarding copy: ask users installing
  the native app to exempt it from battery optimization.
- **`enable-signup: true` is scoped, not open.** Self-registration via
  `/v1/account` is real, but the Caddyfile restricts that path to
  basic-auth — the public internet can still reach `ntfy.queer.guide`
  for publish/subscribe, just not account creation, without the
  password in `.env`.
- **One more service to patch.** Docker image updates (`docker compose
  pull && up -d`) are manual — no auto-update configured, matching the
  Nominatim/Plane services on this box.
