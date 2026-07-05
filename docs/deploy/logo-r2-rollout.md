# Logo pipeline → R2 rollout

Operational runbook for the venue/event logo work. Logos are now **logo-first in
the UI**, **real-logo-only** (no monograms), and **served from our own R2/CDN**
(`img.queer.guide`) with no logo.dev token in any public URL.

Shipped across: #1781 (logo-first display), #1802 (real-logo-only enrichment),
#1808 (new logos → R2), #1811 (existing logos → R2).

## One-time setup

1. **Image-cdn Worker** must have `ADMIN_SECRET` set (it backs `PUT /upload/{key}`).
   Confirm with `cd workers/image-cdn && wrangler secret list`.
2. **Edge-function secret** (lets `enrich-logos` / `migrate-logos-r2` upload to R2):
   ```bash
   supabase secrets set IMAGE_CDN_ADMIN_SECRET=<image-cdn Worker ADMIN_SECRET>
   # optional override, defaults to https://img.queer.guide
   # supabase secrets set IMAGE_CDN_BASE_URL=https://img.queer.guide
   ```
   Until this is set, the daily `enrich-logos` cron and any non-dry-run **fail
   fast by design** (500 with a clear message) rather than churning logo.dev.

   > Dashboard alternative (no CLI): set the same value as `ADMIN_SECRET` on the
   > image-cdn Worker (Cloudflare → Workers & Pages → image-cdn → Settings →
   > Variables & Secrets) **and** as `IMAGE_CDN_ADMIN_SECRET` on the edge
   > functions (Supabase → Project Settings → Edge Functions → Secrets). The two
   > values must match. No redeploy needed — functions read the secret at
   > invocation time.
3. **Deploy**:
   ```bash
   supabase functions deploy enrich-logos pipeline-commit migrate-logos-r2
   ```

## Backfills

Both are admin-gated, idempotent, and safe to re-run. Use `dry_run:true` first to
preview counts. Repeat each until `*_remaining == 0`.

### A. New logos for venues/events without one (`enrich-logos`)
Fetches the real logo (probes `fallback=404`, rejects monograms), mirrors to R2,
stores the CDN URL. No-logo domains are marked attempted and skipped; venues keep
their photos. ~6,210 venue candidates at last count.
```bash
POST /functions/v1/enrich-logos  { "table": "venues", "batch_size": 200 }
POST /functions/v1/enrich-logos  { "table": "events", "batch_size": 200 }
```
Also runs daily via cron (`03:30` venues / `03:35` events).

### B. Re-host existing off-CDN logos (`migrate-logos-r2`)
Moves the ~1,340 Supabase-Storage logos onto R2, repointing `logo_url` at the
tokenless CDN URL.
```bash
POST /functions/v1/migrate-logos-r2  { "table": "venues", "batch_size": 200 }
POST /functions/v1/migrate-logos-r2  { "table": "events", "batch_size": 200 }
```
`errors` counts dead-source / upload failures (left in place); rerun until
`migrated == 0`.

Invoking from `pg_net` (no CLI): both functions accept the vault
`internal_invoke_secret` via the `x-internal-secret` header (`requireInternalOrAdmin`),
so the crons and a manual `net.http_post` can drive them the same way.

## Verify

```sql
-- Should trend to 100% img.queer.guide, 0 img.logo.dev.
SELECT
  count(*) FILTER (WHERE logo_url ILIKE '%img.queer.guide%') AS on_r2,
  count(*) FILTER (WHERE logo_url ILIKE '%img.logo.dev%')    AS still_logodev,
  count(*) FILTER (WHERE logo_url ILIKE '%supabase.co/storage%') AS still_storage
FROM venues WHERE logo_url IS NOT NULL;
```
Spot-check a logo venue on prod (e.g. `/venues/hi-tops`): the hero is the logo,
contained on a neutral tile, and its `src` is an `img.queer.guide/logos/...` URL.

## Finalize

Once `still_logodev == 0` across venues **and** events, no public URL carries the
logo.dev key — **rotate/retire the `sk_` logo.dev token** in the logo.dev
dashboard and update `LOGO_DEV_API_KEY` (used only server-side by `enrich-logos`).

## Security note — `sk_` token leak was wider than the venue logos (2026-07-04)

A pre-R2 legacy path stored raw `img.logo.dev/...?token=sk_<secret>&...` URLs
directly in public columns, exposing the logo.dev **secret** key on every page
view. A full sweep of every `public` base-table text column for
`%logo.dev%token=sk_%` found the exposure was **not just the ~15 venues** the
rollout assumed but **185 rows across five columns**:

| table.column | rows |
|---|---|
| `venues.logo_url` | 15 |
| `events.logo_url` | 152 |
| `organizations.logo_url` | 6 |
| `organizations.cover_image_url` | 6 |
| `search_documents.image_url` (anon search index) | 6 |
| **total** | **185** |

**Remediation applied** (data-only, prod): all 185 URLs nulled;
`logo_url`/`logo_fetched_at` also cleared on the venue/event rows so any with a
`website` stay eligible for correct R2 re-hosting. Note the affected `organizations`
rows held the token in **both** `logo_url` and `cover_image_url`; Postgres won't
update the same row twice in one statement, so the two columns must be cleared in
separate statements. `search_documents` re-syncs from its source entity via
trigger — fix the source first, then the index clears itself. Final sweep: **0
rows remain**.

**Still required:** rotate the logo.dev `sk_` key (above) — nulling the rows stops
future exposure but the key was public historically (may be cached/crawled), so
only rotation fully closes it.

Reusable audit (run periodically; expect 0):
```sql
DO $$
DECLARE r record; hits bigint; total bigint := 0;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema=c.table_schema AND t.table_name=c.table_name
     AND t.table_type='BASE TABLE'
    WHERE c.table_schema='public' AND c.data_type IN ('text','character varying')
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE %I LIKE ''%%logo.dev%%token=sk_%%''',
      r.table_name, r.column_name) INTO hits;
    IF hits > 0 THEN
      total := total + hits;
      RAISE NOTICE 'LEAK %.% = %', r.table_name, r.column_name, hits;
    END IF;
  END LOOP;
  RAISE NOTICE 'TOTAL sk_ leaks: %', total;
END $$;
```

## Notes

- R2 keys are content-addressed (`logos/<sha256>.<ext>`) → identical logos dedupe;
  re-runs are idempotent.
- `pipeline-commit` no longer stamps logos at ingest; the daily `enrich-logos`
  job is the single source of (real, mirrored) logos.
