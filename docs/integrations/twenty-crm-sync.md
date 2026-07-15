# Twenty CRM integration (internal ops / partnerships)

Twenty (`twentyhq/twenty`, AGPL-3.0) runs as a **separate self-hosted service** for the
team to manage real-world relationships — brand/merchant onboarding, affiliate deals,
sponsor/org partnerships, and inbound contact follow-up. It is a **downstream consumer**:
queer.guide pushes a subset of records into it one-way. It never backs the public site, so
none of the RLS / safety-gating / search-sync machinery applies.

Why not "replace parts of the backend": Twenty is a full standalone app with its own
Postgres/auth/API, not an embeddable backend layer. Rehoming the public `personalities` /
`organizations` data there would mean rewriting ~368 frontend data call-sites and losing
safety-gating, provenance, trust scoring, search sync, and ingestion pipelines — strictly
worse. See the approved analysis in the plan file for the full trade-off.

## Architecture

```
Supabase (source of truth)                     Twenty (downstream, self-hosted)
  organizations         ──┐
  marketplace_merchants ──┼─► twenty-sync edge fn ──REST──►  Company / Person
  contact_submissions   ──┘   (cron, one-way, idempotent)
```

- Idempotency is keyed on a Twenty custom TEXT field **`externalId`**, namespaced:
  `org:<id>`, `merchant:<id>`, `contact:<id>`. No cursor is stored on the queer.guide side —
  the sync is stateless and safe to re-run.
- The function **no-ops (200)** while `TWENTY_API_URL` / `TWENTY_API_KEY` are unset, so it is
  inert until go-live.

Code:
- `supabase/functions/twenty-sync/index.ts` — the sync job
- `supabase/functions/_shared/twenty-client.ts` — REST client + `upsertByExternalId`
- `infra/twenty/` — self-host compose + env template

## Go-live runbook

1. **Deploy Twenty** (unmodified — keeps AGPL clean). Use Twenty's **official upstream
   compose** (this is what the working local install runs; `infra/twenty/` is only a
   simplified reference):
   ```bash
   mkdir -p ~/twenty-crm && cd ~/twenty-crm
   curl -fsSL -o docker-compose.yml https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-docker/docker-compose.yml
   curl -fsSL -o .env             https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-docker/.env.example
   # set a secret (current Twenty uses ENCRYPTION_KEY, not APP_SECRET):
   printf '\nENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32)" >> .env
   docker compose up -d
   ```
   First boot runs ~180 metadata/migration steps before the server binds :3000
   (`curl -s localhost:3000/healthz` → `{"status":"ok"}` when ready; ~5–8 min). If the
   `worker` container bailed while the server was still booting, `docker compose up -d worker`
   once the server is healthy. Behind a reverse proxy, set `SERVER_URL=https://crm.queer.guide`.
   Open the app and complete the workspace wizard (create the admin account yourself).

2. **Add the idempotency field.** Settings → Data Model → for **Company** and **Person**,
   add a custom field named `externalId`, type **Text**. (The API field name must serialize
   to `externalId`.)

3. **Create an API key.** Settings → API & Webhooks → Create key. Copy it once.

4. **Set the edge secrets** (edge env — read by `Deno.env.get`):
   ```bash
   supabase secrets set TWENTY_API_URL=https://crm.queer.guide TWENTY_API_KEY=<key>
   ```
   `INTERNAL_INVOKE_SECRET` already exists (shared cron gate). No new Vault secret needed —
   the cron reuses the existing `internal_invoke_secret` Vault entry.

5. **Deploy the function** (also auto-deploys on merge to `main`):
   ```bash
   supabase functions deploy twenty-sync
   ```

6. **Smoke test** before scheduling — a small batch, from an admin session or with the
   internal secret:
   ```bash
   curl -sS -X POST https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/twenty-sync \
     -H "x-internal-secret: <internal_invoke_secret>" \
     -H "content-type: application/json" \
     -d '{"limit": 5}' | jq
   ```
   Expect `success:true` with `items_succeeded > 0` and no `error` entries in `results`.
   Confirm the records appear in Twenty with a populated `externalId`, then re-run and
   confirm the same rows come back as `action:"updated"` (idempotent).

7. **Schedule the cron** (run this SQL once Twenty is live; it is intentionally NOT a
   committed migration so nothing schedules against a non-existent Twenty):
   ```sql
   select cron.schedule(
     'twenty-sync', '25 * * * *',
     $$ select net.http_post(
          url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/twenty-sync',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-internal-secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')
          ),
          body := '{"limit": 500}'::jsonb,
          timeout_milliseconds := 120000
        ) as request_id; $$
   );
   ```
   To pause: `select cron.unschedule('twenty-sync');`

## Field mapping

| Source | Twenty object | Key fields | externalId |
|---|---|---|---|
| `organizations` (status=active) | Company | `name`←legal_name/name, `domainName`←website_domain | `org:<id>` |
| `marketplace_merchants` (is_enabled) | Company | `name`←display_name, `domainName`←shop_domain | `merchant:<id>` |
| `contact_submissions` | Person | `name`←split(name), `emails.primaryEmail`←email | `contact:<id>` |

Twenty built-in composites (`Person.name` = {firstName,lastName}, `Person.emails` =
{primaryEmail}) are handled in `twenty-client.ts`. If a workspace customizes these, adjust
the mapping in `twenty-sync/index.ts`; per-row failures are reported in `results` and never
abort the run.

## Scope / future

- One-way only for now. A later `twenty webhook → edge function` reflection (e.g. "merchant
  approved as partner" flips a flag) should stay tiny and explicit if added.
- Deliberately no schema changes to queer.guide and no writes back — protects the
  disk-constrained prod DB and keeps a single source of truth for public content.
