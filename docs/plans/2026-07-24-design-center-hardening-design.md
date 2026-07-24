# Design Center Hardening — follow-up pass (2026-07-24)

Follow-ups to the Design & Branding Control Center (PR #2256), user-approved tracks.

## A. Trust hardening

- **Publish-time contrast gate** — `PublishDiffDialog` evaluates all `CONTRAST_PAIRS`
  on the draft (both modes). Any pair below 3:1 (fails WCAG even for large text)
  blocks Publish until an explicit "Publish anyway" acknowledgment is checked.
- **Optimistic concurrency** — `branding_save_draft(p_doc, p_expected_updated_at)`
  (migration `20260724040256`): a stale save raises "draft changed since you loaded
  it" (ERRCODE 40001) instead of silently clobbering another admin's work.
- **First-publish undo** — history seeded with version 0 = empty doc (stock site);
  publish prune never deletes v0, so revert-to-stock and first-publish undo always work.

## B. Email coverage

`send-welcome-email` and `send-bulk-email` adopt `_shared/branding.ts`
(`fromHeader` + `wrapHtml`). `send-mailbox-email` deliberately untouched — it relays
the user's own `username@queer.guide` identity; brand wrapper/from would be wrong.

## C. Header runtime branding

`src/hooks/useSiteBranding.ts` — one anon PostgREST read per session
(staleTime Infinity, fail-open to `{}`). `Header.tsx` consumes
`meta.org_logo_url` (custom logo skips the `brightness-0 dark:invert` monochrome
filter) and `meta.site_name` (stacked wordmark splits on first space; aria-label).

## D. Ops

- `.github/workflows/design-audit.yml` — weekly + on-main-push (index.css/docs)
  regeneration of `public/design-audit.json`, direct push with `skip-checks: true`
  trailer (claude-md-drift pattern; never touches PR branches).
- `BrandUploadField` removes the replaced brand-bucket object on re-upload
  (no orphan accumulation).
- `design-audit.mjs` adds a per-file hardcoded color-literal scan
  (`color_literals` section, rendered in the Audit tab).

## Explicitly not done

- Font-family switching (build-time woff2, real work — separate effort).
- `--cat-*` chart palette editing (derived from `--foreground`).
- Live-update on publish beyond page reload.
- e2e Playwright spec for /admin/design (needs seeded admin session).
