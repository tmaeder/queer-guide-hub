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
their photos. ~4,077 venue candidates at last count.
```bash
POST /functions/v1/enrich-logos  { "table": "venues", "batch_size": 200 }
POST /functions/v1/enrich-logos  { "table": "events", "batch_size": 200 }
```
Also runs daily via cron (`03:30` venues / `03:35` events).

### B. Re-host existing off-CDN logos (`migrate-logos-r2`)
Moves the ~1,340 Supabase-Storage logos and the legacy logo.dev token URLs onto
R2, repointing `logo_url` at the tokenless CDN URL.
```bash
POST /functions/v1/migrate-logos-r2  { "table": "venues", "batch_size": 200 }
POST /functions/v1/migrate-logos-r2  { "table": "events", "batch_size": 200 }
```
`errors` counts dead-source / upload failures (left in place); rerun until
`migrated == 0`.

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

## Notes

- R2 keys are content-addressed (`logos/<sha256>.<ext>`) → identical logos dedupe;
  re-runs are idempotent.
- `pipeline-commit` no longer stamps logos at ingest; the daily `enrich-logos`
  job is the single source of (real, mirrored) logos.
