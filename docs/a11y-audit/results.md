## Queer Guide — UX & A11y Audit Results

Date: 2026-04-25
Branch: `docs/plane-cache-cors`
Scope: full app (public + admin); fixes P0–P2.

### Executive summary

- 6 P0 blockers closed (Select aria-label fallback, pipeline-builder orphan labels, `<html lang/dir>` sync to i18next incl. RTL, missing icon-button labels, ~50 bare `<CircularProgress>` → labeled `Spinner`, light/dark contrast tokens bumped to WCAG 1.4.3-compliant `#595959` / `#adadad`).
- 4 P1 high-impact items closed (NewsCard featured variant → `<a>`, CommentNode + GroupNode static-click → `role=button`+keys, AdminShell skip-link, route announcer translated via `t('a11y.navigatedTo')`).
- P1 carousel pause-on-focus + reduced-motion: not actionable — no `embla-carousel-autoplay` plugin in use anywhere.
- P1-9 marketplace target-size: ghost icon-buttons promoted from `size="sm"` to `size="default"` so MUI's 44×44 minimums apply.
- P2-3 toast `aria-live`: verified built-in via Radix `ToastViewport` and Sonner.
- P2-6 ESLint: all 16 `jsx-a11y/*` rules promoted from `warn` → `error`. Lint surface: **0 jsx-a11y errors / 0 warnings**.

### Verification

| Gate | Before | After |
|---|---|---|
| `jsx-a11y` lint | 16 rules at warn (some violations passed silently) | 16 rules at **error**, 0 violations |
| `npm run typecheck` | pass | pass |
| `<html lang>` synced to locale | no | yes |
| `<html dir>` for `ar/he/fa/ur` | no | yes |
| Bare `<CircularProgress>` instances | ~50 (no a11y name) | 0 (Spinner default `aria-label`) |
| Admin skip-link | missing | present (`#admin-main-content`) |

Production axe re-scan against `https://queer.guide` is deferred until this branch is deployed (Cloudflare Pages auto-deploys on push to `main`). Re-run via:

```bash
BASE_URL=https://queer.guide node scripts/a11y-axe-scan.mjs
```

### Files changed

- Tokens: `src/index.css`, `src/theme/muiTheme.ts`
- Primitives: `src/components/loading/Spinner.tsx` (new), `src/components/ui/select.tsx`
- i18n: `src/i18n/index.ts`, `src/App.tsx`
- Admin shell: `src/components/admin/shell/AdminShell.tsx`
- Pipeline builder: `nodes/CommentNode.tsx`, `nodes/GroupNode.tsx`, `panels/AccessDialog.tsx`, `panels/TemplateLibrary.tsx`, `tabs/IntegrationsTab.tsx`
- Map: `components/map/ExploreMapFilters.tsx`, `components/map/ExploreMapLayers.tsx`
- News: `components/news/NewsCard.tsx`
- Marketplace: `components/marketplace/MarketplaceCard.tsx`
- Bulk: ~50 files where bare `<CircularProgress>` got `aria-label="Loading"` (admin, cms, trips, import-hub, pages)
- Lint config: `eslint.config.js`

### Remaining backlog / follow-ups

- Add Lighthouse CI gate (a11y category ≥ 95) to CI.
- Expand Playwright + axe coverage to admin shell + 5 most-used dialogs.
- Audit remaining 239 non-a11y warnings (mostly `@typescript-eslint/no-explicit-any` and `unused-imports`) in a separate pass.
- Once `embla-carousel-autoplay` is adopted, wire pause-on-focus + `prefers-reduced-motion` opt-out at the call site.
- Re-run production axe scan after deploy and append the diff here.
