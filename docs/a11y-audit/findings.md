# UX & Accessibility Audit — Findings

Date: 2026-04-25 · Target: https://queer.guide (production) · Source: `Dev/web` @ `docs/plane-cache-cors`

## Method

- ESLint with `eslint-plugin-jsx-a11y` (16 rules, warn-level) — `npm run lint`
- axe-core via Playwright across 17 public routes — `BASE_URL=https://queer.guide node scripts/a11y-axe-scan.mjs` ([axe-baseline.md](./axe-baseline.md), [axe-baseline.json](./axe-baseline.json))
- Lighthouse a11y category on 7 routes — [lighthouse-baseline/](./lighthouse-baseline/)
- Targeted source review of high-risk surfaces (Header, ui primitives, filter bars, pagination, admin pipeline-builder)
- Admin pages NOT scanned (require auth — see Gaps)

## Top-line numbers

| Tool | Result |
|---|---|
| ESLint `jsx-a11y` | **12 warnings** (admin pipeline-builder, NewsCard) |
| axe (17 routes, public) | **2 critical, 9 serious, 0 moderate, 0 minor** |
| Lighthouse a11y score | 84 (home) → 92 (most others) → 90 (venues) |

The existing baseline is solid: skip link, route-change live region + focus shift, focus-visible tokens, MUI focus overrides, axe specs on `/events` and header. Findings below are gaps, not foundational rebuilds.

---

## Critical (P0)

### C1 · Icon-only buttons on home lack accessible name
- **WCAG:** 4.1.2 Name, Role, Value
- **Routes:** `/`, `/places`
- **axe rule:** `button-name` (critical, 2 nodes home + 2 nodes places)
- **Symptom:** `<button class="MuiIconButton-root">` rendered with only an SVG icon child, no `aria-label` or text. Screen readers announce "button" with no context.
- **Likely source:** carousel / strip nav arrows, calendar month switcher, or AnimatedCounter trigger inside `RegionalEventsCalendar` / `LatestNewsSlider` / discovery components used in `Index.tsx`. Direct selector samples in `axe-baseline.json`.
- **Fix:** add `aria-label={t('...')}` to every `<IconButton>` whose visible content is icon-only.

### C2 · MUI Select components in filter bars have no accessible name
- **WCAG:** 4.1.2
- **Routes:** `/venues`, `/hotels`, `/resources`, `/contact`
- **axe rule:** `aria-input-field-name` (serious, 4 occurrences total)
- **Source:** [src/components/ui/select.tsx:135](src/components/ui/select.tsx) extracts `aria-label` / `aria-labelledby` / `aria-describedby` via `SELECT_ARIA_KEYS` and forwards to `inputProps`, but call sites on filter pages don't pass them. `displayEmpty` + placeholder is the only label.
- **Fix (preferred):** in `select.tsx`, fall back to the registered `placeholder` as `aria-label` on the `<MuiSelect>` `inputProps` when no caller-provided label exists. Single-point fix that closes all four call-site violations.
- **Alt:** add explicit `aria-label` at every filter call site (more touch points, easy to drift).

### C3 · `<html lang>` and `dir` not synced to active i18next locale
- **WCAG:** 3.1.1 Language of Page, 3.1.2 Language of Parts (and RTL for Arabic)
- **Symptom:** App ships 11 locales including Arabic (RTL) but `<html lang>` stays at the build-time value and `<html dir>` is never set to `rtl`. Screen readers will mispronounce content; RTL layout never engages.
- **Source:** i18next init in `src/i18n` and routing in `src/App.tsx` (`LocaleRouter`). No `document.documentElement.setAttribute('lang'/'dir', …)` on locale change.
- **Fix:** subscribe to i18next `languageChanged` (or hook into `LocaleRouter`) and set `lang` + `dir` on `<html>`.

### C4 · CircularProgress without accessible name on home
- **WCAG:** 4.1.2
- **Route:** `/`
- **axe rule:** `aria-progressbar-name` (serious, 1 node)
- **Source:** an `<MuiCircularProgress role="progressbar">` rendered without `aria-label`, likely a stats-strip skeleton. Many `<CircularProgress />` usages across the codebase have no label (samples: [src/components/loading/OptimizedLoader.tsx:123](src/components/loading/OptimizedLoader.tsx:123), [src/components/ui/country-autocomplete.tsx:140](src/components/ui/country-autocomplete.tsx:140), [src/components/admin/AffiliatePartnersManager.tsx:101](src/components/admin/AffiliatePartnersManager.tsx:101)).
- **Fix:** wrap in a small `<Loading aria-label={t('common.loading')} />` primitive (or extend `OptimizedLoader`) and use it everywhere; remove bare `<CircularProgress />`.

### C5 · Color-contrast failures across home, submit, about, venues
- **WCAG:** 1.4.3 Contrast
- **axe rule:** `color-contrast` (serious, 5 nodes home + 1 each on submit/about/venues)
- **Lighthouse:** 23 contrast items on home alone.
- **Pattern:** `<span style="opacity:1">` on tinted backgrounds, MuiTypography body2 in muted color over `action.hover`, button label tints, anchor links inside body copy.
- **Fix:** address at the token layer. Audit `--muted-foreground`, `text.secondary`, and the brand link tint in [src/index.css](src/index.css) and [src/theme/muiTheme.ts](src/theme/muiTheme.ts). Apply per-context where token can't be raised without breaking the design.

### C6 · Admin pipeline-builder forms have orphan `<label>` elements
- **WCAG:** 1.3.1 / 3.3.2 / 4.1.2
- **Source:** ESLint flags 9 violations in [AccessDialog.tsx:125,135](src/components/admin/pipeline-builder/panels/AccessDialog.tsx), [TemplateLibrary.tsx:222,231,240](src/components/admin/pipeline-builder/panels/TemplateLibrary.tsx), [IntegrationsTab.tsx:138,147,158,167](src/components/admin/pipeline-builder/tabs/IntegrationsTab.tsx).
- **Fix:** `htmlFor` + matching input `id`, or wrap inputs inside the label. Also fixes screen-reader name on those inputs.

---

## High Impact (P1)

### H1 · Static elements with click handlers in admin pipeline builder
- **Source:** [CommentNode.tsx:94](src/components/admin/pipeline-builder/nodes/CommentNode.tsx:94), [GroupNode.tsx:81](src/components/admin/pipeline-builder/nodes/GroupNode.tsx:81), [NewsCard.tsx:190](src/components/news/NewsCard.tsx:190).
- **Fix:** convert to `<button type="button">` (NewsCard) or add `role="button" tabIndex={0}` + key handler on the pipeline nodes. The pipeline builder also needs a documented keyboard alternative — see H6.

### H2 · Skip link does not exist in admin shell
- **Source:** Public skip link declared in `App.tsx:305-320`. `AdminShell.tsx` renders before `<main>` (sidebar + topbar) and the skip-link target there is unclear.
- **Fix:** add a parallel skip link in `AdminShell.tsx` pointing at the admin main content region, and ensure the public skip link's `href="#main-content"` matches the `id` on `<main>` in both shells.

### H3 · `<html lang>` aria-live region untranslated when locale changes mid-session
- Pairs with C3 — once lang is dynamic, also re-translate the `aria-live="polite"` route-announcement message in `App.tsx:321-336`.

### H4 · Heading order skipped on home page cards
- **Lighthouse:** `heading-order` (2 nodes on home) — `<h6>` appearing without preceding `h2`–`h5` inside cards.
- **Fix:** demote/promote heading levels in card components so each route maintains a sequential outline starting at `h1`.

### H5 · Header dropdown menus lack arrow-key navigation testing
- **Source:** [Header.tsx](src/components/layout/Header.tsx) — `a11y-header.spec.ts` tests the hamburger drawer but not the desktop dropdown menus.
- **Fix:** verify menus expose `role="menu"` + `aria-expanded`, support arrow keys / Home / End / Escape, return focus to trigger on close. Add a Playwright spec.

### H6 · Pipeline Builder lacks a keyboard alternative
- **Source:** [AdminPipelines.tsx](src/pages/AdminPipelines.tsx) + the visual graph editor in `components/admin/pipeline-builder/`.
- **Fix:** at minimum, ensure every node has `aria-label` summarizing its state and that node selection / edit-panel opening is keyboard-driven. A full keyboard-mode UI is out of scope for this audit — file as separate effort.

### H7 · UniversalSearchBar autocomplete ARIA
- Verify `role="combobox"`, `aria-controls` → results listbox id, `aria-activedescendant` updates on arrow-key, `aria-expanded` flips correctly. Convert to a Radix primitive if a suitable one is already imported elsewhere.

### H8 · Carousel auto-advance + reduced motion
- [src/components/ui/carousel.tsx](src/components/ui/carousel.tsx) — verify auto-advance respects `prefers-reduced-motion` and pauses on focus/hover.

### H9 · `target-size` on inline external links in marketplace
- **axe:** 15 nodes on `/marketplace` (`a[href$="equalityevents.com/"]` etc., 24×24 minimum failure).
- **Fix:** ensure inline external links inside listing rows have at least 24×24 hit area or sufficient spacing per WCAG 2.5.8.

---

## Polish (P2)

- **R1** — Empty / loading / error state consistency across admin tables (route through `EmptyState` which already has `aria-live`).
- **R2** — Microcopy: replace generic toast errors with actionable wording ("Couldn't save event — check the title field" rather than "Something went wrong").
- **R3** — Toast announcement: confirm Radix `<Toast>` carries `role="status"` / `aria-live="polite"`, otherwise wire it through.
- **R4** — Heading order cleanup beyond home (Lighthouse flagged on multiple routes).
- **R5** — Alt-text quality sweep on event/venue/hotel cards (currently driven from data — add fallbacks where source is empty).
- **R6** — Promote 16 `jsx-a11y` rules from `warn` to `error` in [eslint.config.js:41-57](eslint.config.js) once C6 is fixed (lint baseline at zero).
- **R7** — Ship Lighthouse CI gate (no Lighthouse runs in `.github/workflows/`).
- **R8** — Expand axe e2e coverage to all admin surfaces (currently only `/events`, header).

---

## Gaps in this audit

- **Admin not scanned** (no test credentials available). The 33 admin pages share `AdminShell` + `AdminDataTable`, so single-point fixes there will move the needle. Recommend running the same axe script behind admin auth in Phase B.
- **No Lighthouse on detail pages** (event detail, venue detail, hotel detail) — only list pages.
- **Reduced-motion + RTL not exercised** — covered manually in Phase D verification.
- **Keyboard walkthrough** of trip planner, submit form, and admin dialogs is still pending — recommend doing as part of each P0/P1 fix rather than upfront.
