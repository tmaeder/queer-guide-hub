# Design Center Pass 3 — Presets & Scheduling, Fonts, Preview/Validation UX, E2E (2026-07-24)

Third improvement pass on the Design & Branding Control Center (#2256, #2257, #2266).

## Track 1 — Theme presets + scheduled publish
- `site_branding_presets` (named validated docs, cap 20) + `site_branding_schedules`
  (timed windows, revert-to-pre-activation-version). Migration `20260724060722`.
- **`branding_publish_internal(doc, note, actor)`** — the shared publish core,
  extracted so the ungated cron runner and the gated `branding_publish` wrapper
  share one validate→version→prune path.
- **`run_branding_schedule()`** — pure-SQL pg_cron runner (admin_automations
  pattern, `*/5 * * * *`, enabled): activates due pending windows, ends expired
  active ones. No JWT (grants: postgres-owned, service_role EXECUTE); admin
  "Run now" via the data-driven `admin_automation_run('branding_schedule')`.
- RPCs `branding_preset_save/delete/apply` + `branding_schedule_create/cancel`.
- UI: 6th `Presets & schedule` tab + `useBrandingPresets` hook. Apply-to-draft
  keeps the existing publish-diff + contrast gate in the loop.
- Timing: switch visible ~1–11 min after start (5-min cron + 60s edge memo +
  5-min detail cache). Documented, not minute-precise.

## Track 2 — Font management
- `fonts` doc section (display/sans slots, 1–4 woff2 files each). Validation in
  all 3 sites: DB `branding_validate` (migration `20260724060723`), edge
  `functions/_lib/branding.ts`, `tokenCatalog.ts`/`valueValidation.ts`.
- Font URL host hardcoded (validate is IMMUTABLE): our storage bucket or
  `/fonts/`, `.woff2` only. `brand` bucket mime extended with `font/woff2`.
- Edge: `brandStyleTag` emits `@font-face{…font-display:swap}` + `--font-*`
  overrides (custom family PREPENDED to the stock stack = FOUT fallback);
  `brandFontPreloads` preloads the first file per slot.
- **CSP:** `font-src` gains `https://*.supabase.co` in BOTH
  `functions/_lib/securityHeaders.ts` and `public/_headers`.
- UI: `FontsSection` in TokensTab; `BrandUploadField` generalized (accept/
  contentType/pathPrefix/kind) — `.woff2` forced content-type (OS pickers report
  octet-stream). Live preview via FontFace API in `TokenPreviewPanel`.

## Track 3 — Preview & validation UX
- `valueValidation.ts` mirrors every `branding_validate` value rule client-side;
  `collectDraftErrors` → `controller.validationErrors` (dot-path keyed). Inline
  red-border + message on every field; DraftStatusBar shows an `N invalid` badge
  and disables Save/Publish; PublishDiffDialog gates too.
- `TokenSpecimen` extracted from TokenPreviewPanel → side-by-side Published vs
  Draft in the publish dialog (only when tokens/fonts changed).
- Mobile-width toggle (375px) + color-blindness simulation (inline SVG
  feColorMatrix) in the preview header.
- Asset URL reachability: `BrandUploadField` img `onError` → "Couldn't load"
  placeholder (no CORS-broken HEAD probes).

## Track 4 — E2E
- `e2e/admin-design.spec.ts`: unauthenticated smoke + authenticated read-only
  flow (edit token → status bar → publish diff → Cancel). **Never mutates** —
  `page.route('**/rest/v1/rpc/branding_*', abort)` guard because all e2e runs hit
  prod Supabase. Nightly only.
- Vitest: `valueValidation.test.ts` (table-driven), `PublishDiffDialog.test.tsx`
  (contrast ack-gate — the path e2e deliberately avoids).

## Explicitly not done
Font subsetting; italic-file UI row polish (validator accepts it); `--cat-*`
palette editing; live-update-on-publish beyond page reload; per-preset
scheduling of >1 window overlap (rejected at create).
