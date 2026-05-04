# Events Audit 2026-05 — Follow-ups

Items discovered during the audit that are out of scope for this PR.

## Pre-existing botched-merge files — RECONSTRUCTED

Three files on `main` shipped with unresolved merge artifacts that
produced TypeScript parsing errors. They blocked the husky `pre-push`
lint hook for everyone. The events-audit branch reconstructed them by
inferring intent from the surrounding code:

- **`functions/_middleware.ts`** — kept the locale + detail + landing
  Phase 3 / 3.7 import block; dropped the older no-locale/no-detail
  variant. Single `onRequest: PagesFunction<Env>` signature using
  `splitLocale(pathname)` to derive `basePath`, `resolveLandingRoute`
  early-return, then `resolveDetailRoute` with `meta`/`canonical`/
  `ogImage`/`indexable` derived against `basePath`. Single
  `rewriter.on('#root', …)` for bots using `detail?.body ??
  buildBodyHtml(basePath, …)`. Single `const rewritten`. Cache-Control
  edge cache only set when `detail` matched.
- **`functions/sitemap-places.xml.ts`** — `Promise.all` now destructures
  into three vars (`cities`, `countriesByCode`, `countriesBySlug`).
  Cities emit two entries each (`/places/:slug` + `/city/:slug`).
  Countries-by-code emit `/places/:code-lower`; countries-by-slug emit
  `/country/:slug`.
- **`scripts/seo-check.mjs`** — single dual-fetch `check()` returning
  one object that includes `hreflangs`, `botStatus`, `botH1`,
  `botBodySize` (consumed by the assertions further down the file).

These three files were removed from the `eslint.config.js` ignores
list. If the reconstructions don't match production intent, the
existing `npm run -- node scripts/seo-check.mjs` regression run
against staging will surface the divergence on the next deploy.

## Spec items skipped (will verify or drop after runtime audit)

To be filled during runtime audit pass — see PR body.

## P3 / nice-to-have

- Hide trending rail when any filter is active (the rail confuses the
  empty-state copy).
- Add a stronger selected-day style in the calendar grid.
- Add Playwright a11y snapshots using `@axe-core/playwright`; gate the PR
  on no new violations.
