# UX & Accessibility Backlog

Synthesized from [findings.md](./findings.md). IDs map back to findings.

Sizes: XS = <30min, S = 30–90min, M = 2–4h, L = half-day+

## P0 — Blockers (do first)

| ID | Title | Scope | Risk | Size | Acceptance |
|---|---|---|---|---|---|
| P0-1 | Add `aria-label` to all icon-only `IconButton`s on home + places (C1) | RegionalEventsCalendar, LatestNewsSlider, AnimatedCounter, discovery components used by `pages/Index.tsx` and `pages/Places.tsx` | Low | S | axe `button-name` = 0 on `/` and `/places` |
| P0-2 | Fall back to placeholder for Select `aria-label` in shared wrapper (C2) | [src/components/ui/select.tsx:135](src/components/ui/select.tsx) | Low (additive) | XS | axe `aria-input-field-name` = 0 on `/venues`, `/hotels`, `/resources`, `/contact` |
| P0-3 | Sync `<html lang>` and `dir` to active i18next locale (C3) | i18n init + `LocaleRouter` in `App.tsx` | Low | S | `document.documentElement.lang` matches active locale; `dir="rtl"` when locale = `ar` |
| P0-4 | Introduce `<Loading aria-label>` primitive; replace bare `<CircularProgress />` (C4) | new util in `components/loading/`, replace ~15 call sites | Low | M | axe `aria-progressbar-name` = 0 on `/`; no bare `<CircularProgress />` left |
| P0-5 | Fix color-contrast at the token level (C5) | `src/index.css`, `src/theme/muiTheme.ts` (audit `--muted-foreground`, `text.secondary`, link tints) | Med (visual change) | M | Lighthouse `color-contrast` audit passes on home + 6 sampled routes; visual diff signed off |
| P0-6 | Associate orphan `<label>`s with controls in pipeline-builder forms (C6) | AccessDialog.tsx, TemplateLibrary.tsx, IntegrationsTab.tsx | Low | S | `npm run lint` reports 0 jsx-a11y warnings |

**Gate:** all axe critical+serious = 0 on the 17 public routes; `npm run lint` clean; existing e2e green.

## P1 — High Impact

| ID | Title | Scope | Risk | Size | Acceptance |
|---|---|---|---|---|---|
| P1-1 | Replace static-element click handlers with buttons (H1) | CommentNode.tsx, GroupNode.tsx, NewsCard.tsx | Low | S | lint clean; nodes/cards activate via Enter/Space |
| P1-2 | Skip-link parity in admin shell (H2) | AdminShell.tsx | Low | XS | Tab on admin route reveals "Skip to main content" → focuses admin main region |
| P1-3 | Translate route-announcement text reactively on locale change (H3) | App.tsx route announcer (lines 321-336) | Low | XS | Switching locale updates announcer string |
| P1-4 | Heading-order cleanup on home + cards (H4) | components/cards/*, pages/Index.tsx | Low | S | Lighthouse `heading-order` passes |
| P1-5 | Header dropdown keyboard nav + a11y spec (H5) | Header.tsx; new `e2e/a11y-header-menus.spec.ts` | Med | M | Spec asserts arrow keys, Esc, focus return; `aria-expanded` toggles |
| P1-6 | Pipeline Builder: per-node `aria-label` summaries + keyboard select (H6, partial) | components/admin/pipeline-builder/* | Med | M | Each node has descriptive `aria-label`; Tab + Enter select+open node panel |
| P1-7 | UniversalSearchBar combobox ARIA (H7) | wherever it lives in `components/search/` | Med | M | Combobox role, controls, activedescendant, expanded all behave per WAI-APG combobox pattern |
| P1-8 | Carousel reduced-motion + pause-on-focus (H8) | components/ui/carousel.tsx | Low | S | With `prefers-reduced-motion: reduce`, autoplay disabled; focus pauses |
| P1-9 | Marketplace external link target-size (H9) | components/marketplace/* (listing row component) | Low | S | axe `target-size` = 0 on `/marketplace` |
| P1-10 | Add `e2e/a11y-admin.spec.ts` (axe over AdminDashboard, AdminEvents, one bulk-edit dialog) | new spec, requires E2E_ADMIN_AUTH | Med | M | Spec runs in CI; baseline captured |

**Gate:** Lighthouse a11y ≥ 95 on all sampled routes; axe scan re-run captures deltas in `results.md`.

## P2 — Polish

| ID | Title | Size |
|---|---|---|
| P2-1 | Standardize empty/loading/error states across admin tables via `EmptyState` (R1) | M |
| P2-2 | Rewrite generic toast errors to actionable copy (R2) | M |
| P2-3 | Verify Radix toast carries `role="status"` (R3) | XS |
| P2-4 | Heading-order cleanup beyond home (R4) | S |
| P2-5 | Alt-text fallbacks on cards when source data is empty (R5) | S |
| P2-6 | Promote 16 jsx-a11y rules to `error` (R6) | XS |
| P2-7 | Add Lighthouse CI gate (R7) | M |
| P2-8 | Expand axe e2e coverage across admin (R8) | M |

## Sequencing

1. Land P0-2, P0-6, P0-3, P0-1 first (XS+S, low-risk wins).
2. P0-5 next — allow time for visual review since tokens shift colors.
3. P0-4 alongside P1-8 (loading + reduced-motion together).
4. P1 wave: tackle in order, P1-10 last so admin axe baseline reflects post-P0 state.
5. P2 wave once P0+P1 verification passes.
