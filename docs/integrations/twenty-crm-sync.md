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
| `organizations` (status=active) | Company | all attrs; website→`qgWebsite` (NOT domainName) | `org:<id>` |
| `marketplace_merchants` (is_enabled) | Company | display_name, provider, slug, sync status | `merchant:<id>` |
| `contact_submissions` | Person | name, email, category, message | `contact:<id>` |
| `personalities` (visibility=public) | Person | name, bio, profession, nationality, website — **no `lgbti_connection`** (outing-sensitive) | `personality:<id>` |
| `profiles` (moderation=approved) | Person | display_name, username, location, company, industry, job_title — **NO identity/dating/contact/encrypted fields** (GDPR special-category) | `profile:<id>` |

**Privacy:** users sync only non-sensitive professional fields; sexual orientation / gender
identity / dating / encrypted columns are never sent to the CRM. `profiles` write-back is
disabled (empty whitelist) — a user's handle/identity is not CRM-editable.

**Big-table backfill:** personalities (~2k) exceed one run's budget. Backfill once with
`{"only":"personalities","limit":400,"offset":N}` looping N; the hourly cron (unfiltered,
limit 500, updated_at desc) keeps recently-changed rows fresh.

## Content entities → Twenty custom objects (outbound-only)

The full content platform (~147k rows) syncs to purpose-made Twenty **custom objects**
(not Company/Person): `venue`, `qgEvent`, `qgCity`, `qgCountry`, `hotel`, `village`,
`newsArticle`, `product`. Each has a UNIQUE `externalId` (`venue:<id>`, `event:<id>`,
`city:<id>`, `country:<id>`, `hotel:<id>`, `village:<id>`, `news:<id>`, `product:<id>`) and
qg* TEXT fields. Driven by the same `{only, offset}` params, id-ordered for a stable
offset backfill (`scratchpad/backfill.sh` loops all 8). **Outbound-only** — the inbound
webhook covers Company/Person only, so content edits in Twenty don't write back (editing
40k events / 33k news in a CRM isn't a real workflow). Volumes: products 45k, events 40k,
news 33k, venues 24k, cities 5k, hotels/countries/villages small.

Twenty built-in composites (`Person.name` = {firstName,lastName}, `Person.emails` =
{primaryEmail}) are handled in `twenty-client.ts`. If a workspace customizes these, adjust
the mapping in `twenty-sync/index.ts`; per-row failures are reported in `results` and never
abort the run.

## Normalization in the sync (2026-07)

The sync is the normalization gate — junk can't re-enter Twenty:

- **Explicit nulls:** empty source values are sent as `null` (not omitted) so stale
  TEXT-era junk (`''` placeholders) is cleared on the next push. Omission is reserved for
  PROTECT (pending inbound review) and unresolved relation targets. A cleared source FK
  also nulls the Twenty relation.
- **Countries:** all `qgCountry` values are canonicalized to full English names via
  `_shared/geo-normalize.ts` (`buildCountryCanon`: countries table + alias map) — venues/
  events store ISO-2, companies/hotels full names; Twenty gets one vocabulary.
- **URLs:** `link()` canonicalizes (scheme added, host lowercased, `utm_*`/`fbclid`/…
  params and bare trailing slash stripped); unparseable URLs become `null`.
- **Placeholder addresses** (venue address == venue name, hotel address == city) are
  suppressed to `null` — they carried no information.
- **`qgDomain`** (companies, plain TEXT): normalized registrable domain from
  `extractDomain()` for filtering/grouping. Deliberately NOT Twenty's built-in
  `domainName` — Twenty auto-merges records sharing `domainName`, which would collapse
  legitimately distinct entities (org + merchant pre-merge, multi-venue orgs) and break
  the `externalId` idempotency key. Do not "fix" this by populating `domainName`.

Field types in the workspace are typed (SELECT/LINKS/EMAILS/PHONES/DATE/CURRENCY) — see
`docs/integrations/twenty-crm-field-types.md`. Schema drift is checked with
`scripts/data-quality/twenty-schema-audit.mjs`; the stalled TEXT→typed migration is
completed by `scripts/data-quality/twenty-schema-repair.mjs` (dry-run by default).

## Two-way (inbound, review-gated)

Edits made **in Twenty** flow back through review — they never touch public content
directly. Twenty `company.updated` / `person.updated` webhooks hit `twenty-inbound`
(gated by `?token=` = env `TWENTY_WEBHOOK_SECRET`), which diffs a **whitelist** of safe
editorial fields against the source row and writes a PENDING proposal to
`twenty_inbound_review`. An admin reviews at **/admin/content/twenty-crm** and
approves — `approve_twenty_inbound_change(id)` applies only whitelisted columns to the
source table and stamps `field_provenance.source='twenty+human'` (organizations).
`reject_twenty_inbound_change(id)` discards. Approvals are manual (not bulk), so
safety-gating, the review model, and batched search-sync are all preserved.

The outbound sync **skips any field that has a pending inbound review** (checked per
`externalId` at the top of each run), so a human's Twenty edit survives until it's
approved or rejected — it isn't clobbered by the hourly push.

Whitelist (`twenty_inbound_allowed_columns`): organization = name, description,
editorial_hook, editorial_long, email, phone, website, logo_url · merchant =
display_name · contact = name, category. Scores / safety flags / ids are **never**
writable from Twenty. Migration `20260715183310_twenty_inbound_review.sql`; webhook
registered via `POST /rest/webhooks`.

## Data-quality program (2026-07-16)

Live state after the CRM data-quality rollout:

- **Workspace schema**: all `qg*` fields typed (SELECT/LINKS/EMAILS/PHONES/DATE/CURRENCY);
  legacy TEXT archived as `<field>Legacy`; `qgCompletenessScore`/`qgTrustScore`/
  `qgNeedsAttention` on all content objects; `companies.qgDomain`.
- **Surfaces**: 9 quality views (Needs attention / Missing contact / Low completeness /
  Active events) + "Data Health" dashboard + "Pending QG review flag" workflow (creates a
  task when `qgNeedsAttention` flips true on a company). Stock demo workflows removed.
- **Enrichment (source-side)**: `venue-contact-enrich` (crawl + regex + MX + LLM fallback),
  `venue-osm-enrich` (Nominatim trickle), `scripts/data-quality/enrich-organizations.mjs`,
  extended `pipeline-enrich-country-editorial`, star-rating grounding guard in
  `hotel-agentic-enrich`. All provenance-stamped, review-gated below auto-apply confidence.
- **Dedup/normalize**: `link_org_merchant_domain_matches()` (merchant→org by domain),
  `organization` entity in dedup-engine, `run_data_normalization_guard()` nightly,
  `run_org_quality_recompute()` + `run_content_completeness_recompute()` nightly.
- **Events**: `link_event_venues()` (name+city match), flyer-title cleanup in
  `event-agentic-enrich` (original kept in `events.raw_title`).
- **Inbound**: venues whitelisted (name, description, email, phone, website, booking_url,
  accessibility_notes). ⚠ Operator step still open: register the Twenty `venue.updated`
  webhook (`POST /rest/webhooks`, targetUrl = twenty-inbound URL with `?token=` =
  `TWENTY_WEBHOOK_SECRET`), mirroring the company/person registration.

Known sync tails: Twenty's REST layer rejects a small % of records that GraphQL accepts
(podcast news rows with junk `url` values, phones without derivable calling codes) —
`sample_errors` in the sync response lists them; fix at source, not in Twenty.

## Scope / future

- Deliberately minimal schema footprint on queer.guide (one review table); no direct
  writes to public content from Twenty — protects the disk-constrained prod DB and keeps
  the review model as the single gate for public data.
