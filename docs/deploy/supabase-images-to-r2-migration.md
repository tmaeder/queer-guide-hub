# Migrating all images off Supabase Storage → Cloudflare R2

Goal: the product hosts **no images on Supabase Storage**. Everything lives on
Cloudflare R2, served from `img.queer.guide`.

There are two halves: **(1) stop new writes** (shipped in code) and **(2) migrate
the ~6.5 GB backlog + delete the buckets** (operator-run script).

## 1. Source redirects (shipped)

Every uploader that wrote to a Supabase image bucket now writes to R2 via
`mirrorImageToR2` (`supabase/functions/_shared/logo-mirror.ts`, content-addressed
`PUT img.queer.guide/upload/{prefix}/{sha256}.{ext}`):

| Writer | Now |
|---|---|
| `marketplace-image-mirror` | R2 prefix `marketplace-images` |
| `_shared/image-search.ts` `storeImageToStorage` (city/country/village) | R2 prefix = bucket name |
| `store-tag-images`, `bulk-create-ai-tags` | R2 prefix `tag-images` |
| `import-adult-models-csv` | R2 prefix `adult-model-images` |
| `TagImageUpload.tsx`, `AddPersonalityDialog.tsx`, `useFlyerScan.ts`, `FeedbackButton.tsx` | new edge fn `upload-image-r2` (JWT-gated) → R2 |

### Required secrets

These edge functions now need the image-cdn admin secret (previously only
`enrich-logos` had it). Set on **every** function above + `upload-image-r2`:

```
supabase secrets set IMAGE_CDN_ADMIN_SECRET=<image-cdn Worker ADMIN_SECRET>
supabase secrets set IMAGE_CDN_BASE_URL=https://img.queer.guide
```

(Secrets are project-wide, so one `secrets set` covers all functions.) Then
deploy: `supabase functions deploy upload-image-r2 marketplace-image-mirror
store-tag-images bulk-create-ai-tags import-adult-models-csv fetch-images`.
`upload-image-r2` keeps the default `verify_jwt=true`.

## 2. Backlog migration (operator-run)

Script: `scripts/data-quality/migrate-supabase-images-to-r2.mjs`. URL-driven and
resumable via a local `.image-migration-state.json` — safe to re-run any phase.

```bash
export SUPABASE_URL=https://xqeacpakadqfxjxjcewc.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service-role key>
export IMAGE_CDN_ADMIN_SECRET=<image-cdn Worker ADMIN_SECRET>
export IMAGE_CDN_BASE_URL=https://img.queer.guide

# 1. Scan every DB column for Supabase-Storage URLs → state file
node scripts/data-quality/migrate-supabase-images-to-r2.mjs map

# 2. Fetch each Supabase object and PUT it to R2 (idempotent, content-addressed)
node scripts/data-quality/migrate-supabase-images-to-r2.mjs copy --concurrency=8

# 3. Rewrite every DB URL (image_assets, marketplace images[], entity columns,
#    search_documents) from Supabase → R2. Throttled to avoid a search-trigger
#    write storm on the disk-constrained DB. Preview first:
node scripts/data-quality/migrate-supabase-images-to-r2.mjs repoint --dry-run
node scripts/data-quality/migrate-supabase-images-to-r2.mjs repoint

# 4. Confirm zero leftover Supabase refs + spot-check R2 URLs resolve
node scripts/data-quality/migrate-supabase-images-to-r2.mjs verify

# 5. DESTRUCTIVE — only after verify shows 0 leftovers: empty + drop the buckets
node scripts/data-quality/migrate-supabase-images-to-r2.mjs delete            # dry preview
node scripts/data-quality/migrate-supabase-images-to-r2.mjs delete --confirm
```

Notes:
- ~29.5k objects / ~6.5 GB; `copy` downloads each object locally to hash it, so
  run it somewhere with bandwidth. Re-run `copy` to retry `error` rows.
- `dead` rows (source 404) are skipped and left pointing at the old URL — check
  `verify`'s status table; those are already-broken images to clean up separately.
- Scope flags: `--table=schema.col`, `--limit=N`, `--state=<path>`.
- Orphaned bucket objects with no DB reference (e.g. `adult-model-images` that
  nothing links) are removed by `delete` without needing a repoint.
- After deletion, `img.queer.guide` transparently serves everything; the CF
  resize path (`buildCfSrcSet`) already covers R2 assets.
