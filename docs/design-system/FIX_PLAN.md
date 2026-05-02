# Design System Fix Plan

> Generated from a critical audit on 2026-05-02. Source: see audit transcript.
> This plan is structured for Claude Code: each task is a discrete, PR-sized unit
> with file paths, steps, and acceptance criteria. Phases can run sequentially
> or in parallel where dependencies allow.

## How to use this plan

- Each task has an ID like `P0-1`. Reference the ID in commit messages and PR titles.
- Tasks within a phase are independent unless `Depends on:` is set. Run them in parallel.
- `AC:` (acceptance criteria) is the bar for "done." Don't ship without each item ticked.
- `Test:` describes how to verify the fix locally and in CI.

---

## Phase 0 — Stop the bleeding (production bugs)

User-facing breakage. Ship this week.

### P0-1 — Fix `/cities` 404

The homepage stats counter advertises `547+ CITIES` but `/cities` returns the 404 page.

- **Files:** `src/App.tsx` (or wherever the router is wired), `src/pages/Cities.tsx` (likely missing), homepage stats component.
- **Steps:**
  1. Search for the route definition — `grep -r 'path.*venues' src/` and find the equivalent for cities.
  2. If the page component doesn't exist, scaffold one mirroring `src/pages/Venues.tsx` but querying the `cities` Meilisearch index.
  3. If the route is registered but renders empty, debug the data query.
- **AC:**
  - [ ] `/cities` returns a 200 and renders a city listing page
  - [ ] Homepage `CITIES` stat is a clickable link to `/cities`
  - [ ] At least one city detail page (`/cities/:slug`) is reachable from the listing
- **Test:** `npm run test:e2e -- --grep cities` — add a Playwright spec under `e2e/cities.spec.ts` that hits `/`, clicks the stat, and asserts a city card is rendered.

### P0-2 — Fix `/news` featured-story column-collapse

The first featured story headline wraps one word per line; right-side stories render fine. This is a flex/grid sizing bug — the left column has no `min-width`.

- **Files:** `src/pages/News.tsx` and the featured-story component it uses (search for `Featured Stories` text).
- **Steps:**
  1. Identify the grid container. Likely `display: grid; grid-template-columns: 1fr 2fr` or similar.
  2. Add `min-width: 0` to the featured-story column (CSS grid items need this when their content is non-shrinkable).
  3. Or set `grid-template-columns: minmax(280px, 1fr) 2fr`.
- **AC:**
  - [ ] Headline wraps naturally at ≥768px viewport
  - [ ] Story image (currently missing) renders if the article has one; falls back to `CardImage` pattern otherwise
- **Test:** Visual snapshot in `e2e/news.spec.ts` at 1280×720 and 390×844.

### P0-3 — Restore venue images on `/venues`

Every venue card shows the generic pin SVG placeholder; no actual photos. Either the `image_url` field isn't populated or the card component isn't reading it.

- **Files:** `src/components/venues/VenueCard.tsx` (or equivalent), `scraper/` venue source modules, Supabase `venues` table.
- **Steps:**
  1. Inspect a venue row in Supabase: `SELECT id, name, image_url, photos FROM venues LIMIT 5`.
  2. If `image_url` is populated → fix the card component to render it via `CardImage` from `src/components/ui/card.tsx`.
  3. If `image_url` is null → check the scraper source for missing image extraction; backfill via `pipeline-quality-enhance`.
  4. While there, replace the generic pin SVG fallback with `CardImage`'s built-in `bgcolor: 'action.hover'` + brand-icon-at-0.5-opacity pattern.
- **AC:**
  - [ ] At least 80% of venue cards render a real image
  - [ ] The remaining 20% use the brand fallback, not the pin SVG
  - [ ] `<img>` has `loading="lazy"` and `alt` (re-use `CardImage` to get this for free)
- **Test:** `e2e/venues.spec.ts` — count `<img>` elements with non-empty `src` on `/venues`; expect ≥18 of 24.

### P0-4 — Restore marketplace images on `/marketplace`

Same diagnosis as venues. 100% of cards are text-on-grey.

- **Files:** `src/pages/Marketplace.tsx`, marketplace card component, `workers/ingest/` `marketplace-image-mirror` worker.
- **Steps:**
  1. Check the R2 bucket `marketplace-images` for actual file count: `wrangler r2 object list marketplace-images --account-id=…`.
  2. If empty: the mirror worker isn't running or is failing — check workflow runs in `workflow_runs` table for `marketplace-ingestion` status.
  3. If populated: the card component isn't using the mirrored URL — fix the field mapping.
- **AC:**
  - [ ] Marketplace cards show product images
  - [ ] Cards with no image use `CardImage`'s brand fallback
- **Test:** Same pattern as P0-3.

### P0-5 — Verify `/admin` access control

I reached `/admin` with no auth challenge in the audit. This may be intentional (RLS-only, cached session, role-gated server-side) or a real gap.

- **Files:** `src/pages/AdminDashboard.tsx`, route guards in `src/App.tsx`, Supabase RLS policies on admin tables.
- **Steps:**
  1. Open `/admin` in an incognito window with no Supabase session cookies.
  2. If it loads → critical security issue. Add a route guard that redirects to `/login` when no user or no `is_admin` flag.
  3. Audit all `Admin*` routes for the same gate.
  4. Verify RLS on every `admin_*` and editorial table — staff-only writes.
- **AC:**
  - [ ] Anonymous visit to `/admin` redirects to login
  - [ ] Non-admin authenticated user sees a 403 page, not the admin shell
  - [ ] Every admin RPC has `auth.role() = 'authenticated' AND is_admin(auth.uid())` or equivalent
- **Test:** `e2e/admin-auth.spec.ts` — three personas (anon, member, admin) hit `/admin` and assert correct response.

### P0-6 — Fix homepage stats race + low-N display

`0+ VENUES, 0+ MEMBERS, 0+ CITIES, 0+ EVENTS` shown for ~4s on first paint, then animate up. `1+ MEMBERS` (genuine value) renders at 64px in brand color — undermines social proof.

- **Files:** Homepage stats component (search `9,996+` or similar in `src/`).
- **Steps:**
  1. Replace the `0+` initial state with a skeleton-shimmer using `<Skeleton>` from `src/components/ui/skeleton.tsx` (or MUI Skeleton — they're already wave-animated per `muiTheme.ts`).
  2. Hide any stat below a threshold (suggest `< 100`) — render the label only, no number, until the count meaningfully signals scale.
  3. Consider SSR/edge-cache the aggregates so they're in the HTML on first paint.
- **AC:**
  - [ ] No `0+` ghost values shown to users
  - [ ] Stats below threshold render gracefully ("Members" with no number, or hide entirely)
  - [ ] First contentful paint of stat values ≤ 1s on a fast connection
- **Test:** Add a Lighthouse CI check or compare two screenshots — initial vs. settled.

---

## Phase 1 — Token discipline

The system has rules; the codebase doesn't follow them. Fix the source-of-truth contradictions, then enforce.

### P1-1 — Single source of truth for brand color

Three definitions exist:
- `index.css` `--brand` (light: `hsl(346 87% 38%)`, dark: `hsl(346 100% 65%)`) ✓ canonical
- `muiTheme.ts` `brandColors.main` `#b60d3d`, `brandColors.light` `#ff7386` ✓ matches
- Hardcoded `rgb(255, 115, 134)` in homepage stats ✗ uses dark-mode color in light mode
- Hardcoded `'#DB2777'` fallback in `src/components/ui/card.tsx:99` ✗ a fourth pink

- **Files:** `src/components/ui/card.tsx`, homepage stats component, anywhere else `grep -r '#ff7386\|#b60d3d\|#DB2777' src/` returns.
- **Steps:**
  1. In every TSX file, replace hardcoded magenta/pink hex values with `theme.palette.brand.main` (component code) or `hsl(var(--brand))` (CSS-in-JS / inline styles).
  2. In `card.tsx:99`, change the fallback from `'#DB2777'` to `'currentColor'` or `theme.palette.brand?.main || theme.palette.primary.main`.
  3. In the homepage stats, replace the hardcoded `#ff7386` with `'brand.main'` via the MUI sx prop — let the theme's light/dark switch handle the palette.
- **AC:**
  - [ ] `grep -r '#ff7386\|#b60d3d\|#DB2777\|rgb(255, 115, 134)' src/` returns 0 hits outside `theme/` and `index.css`
  - [ ] Homepage stats render in light-mode magenta `#b60d3d` on light background, light-pink `#ff7386` on dark background
- **Test:** Visual diff — homepage in both themes.

### P1-2 — Reconcile destructive/warning palette

`index.css` maps `--destructive` and `--warning` to `--brand` (same magenta). `muiTheme.ts` uses `#b31b25` (light) / `#fb5151` (dark) — different reds. Pick one.

- **Files:** `src/index.css`, `src/theme/muiTheme.ts`.
- **Decision required:** Should error states use brand magenta (visually monochrome but semantically ambiguous) or a distinct red (chromatic but clear)?
- **Recommendation:** keep `error/warning` distinct from `brand`. Update `index.css` `--destructive` and `--warning` to match the muiTheme reds. Document that error/warning are *not* part of the "monochrome + single accent" rule.
- **AC:**
  - [ ] CSS vars and MUI palette agree on error/warning hex values
  - [ ] `CLAUDE.md` design section updated to acknowledge error/warning as an exception
- **Test:** Render an `<Alert variant="destructive">` in both themes; visually verify against tokens.

### P1-3 — Decide on Plus Jakarta Sans

CLAUDE.md says "Inter (body + headings)." Prod ships Plus Jakarta Sans `@font-face` blocks (`src/index.css` lines 7–55) plus `.woff2` files in `/public/fonts/plus-jakarta-sans/`. Either Inter-only is wrong or Plus Jakarta is dead code shipping 4 woff2 files to every user.

- **Files:** `src/index.css`, `public/fonts/plus-jakarta-sans/*`, `src/theme/muiTheme.ts`.
- **Steps (if Inter-only):**
  1. Delete `@font-face` blocks for Plus Jakarta in `src/index.css`.
  2. Delete `public/fonts/plus-jakarta-sans/`.
  3. `grep -r 'Plus Jakarta' src/` and replace any `font-family` declarations with `'Inter, sans-serif'`.
- **Steps (if dual-typeface is intentional):**
  1. Update `CLAUDE.md` design section to document both typefaces and *when* each is used.
  2. Add a `fontFamily.display` and `fontFamily.body` to `muiTheme.ts` typography.
  3. Document in `docs/design-system/typography.md`.
- **AC:**
  - [ ] `getComputedStyle()` probe of all visible text on prod returns ≤2 distinct font-families (Inter + system fallback chain)
  - [ ] Network tab shows ≤4 woff2 requests on first load
- **Test:** Lighthouse network audit + a custom Playwright spec that walks the DOM and asserts on `font-family`.

### P1-4 — Resolve admin chromatic palette

Admin sidebar uses 11 distinct Tailwind palette colors at 8% opacity for category badges. Either formalize this as a deliberate exception or revert to brand-only.

- **Files:** `src/pages/AdminDashboard.tsx`, admin sidebar component, `src/index.css` `--cat-*` tokens.
- **Decision required:** does the admin genuinely benefit from chromatic differentiation across 14 content types?
- **Recommendation A (formalize):** define `--cat-venues`, `--cat-events`, etc. as actually distinct colors in `index.css`, document them as the **admin-only exception**. The `--cat-*` token system already exists — populate it instead of mapping everything to brand.
- **Recommendation B (revert):** replace the Tailwind hex values with `hsl(var(--brand) / 0.08)` everywhere in admin. Differentiate category items by icon and label only.
- **AC:**
  - [ ] No raw Tailwind hex values (`#3b82f6`, `#10b981`, etc.) anywhere in `src/`
  - [ ] If A: documented in `docs/design-system/admin-palette.md`; if B: visually monochrome admin
- **Test:** `getComputedStyle()` probe of admin sidebar — assert ≤2 distinct background colors.

### P1-5 — Eliminate the off-brand chat-bubble shadow

The floating feedback bubble at bottom-right uses `rgba(217, 119, 87, …)` (a coral `#d97757`) for its glow shadows. This is not the brand color and contradicts the "0 shadows" rule.

- **Files:** Find via `grep -r '#d97757\|217, 119, 87' src/ scripts/` — likely a third-party widget loader or `src/components/feedback/*`.
- **Steps:**
  1. If first-party: remove the `box-shadow` entirely (per the flat philosophy) and use `bgcolor: 'brand.main'` for the bubble fill.
  2. If third-party: scope it via a wrapper that overrides the shadow.
- **AC:**
  - [ ] No `#d97757` anywhere in the rendered DOM
  - [ ] Chat bubble has zero box-shadow
- **Test:** Custom Playwright probe — `expect(getComputedStyle(chatBubble).boxShadow).toBe('none')`.

### P1-6 — Sweep remaining hardcoded colors

`grep` found **107 occurrences of hex/rgb/hsl literals across 20 files** in `src/`. Some are config (map style URLs, etc.) — many are inline styles that should reference tokens.

- **Files:** all 20 from the grep output (see audit transcript for the list).
- **Steps:**
  1. For each file, manually triage each occurrence: is it a config value (allow), a token reference that should use the var (replace), or a one-off that should be a new token (extract)?
  2. Document the allowlist in the lint rule (P2-1).
- **AC:**
  - [ ] Hardcoded color count drops from 107 to ≤15 (only config-data)
- **Test:** `npm run lint` (after P2-1 lands) returns 0 warnings.

---

## Phase 2 — Enforcement (CI guards)

Without these, every fix from Phase 1 will regress within a quarter.

### P2-1 — ESLint rule: no hardcoded colors

- **Files:** `.eslintrc.cjs` or `eslint.config.js`.
- **Steps:**
  1. Add `eslint-plugin-no-color-literals` or write a custom rule using `no-restricted-syntax`.
  2. Pattern: reject `Literal` nodes whose value matches `/^#[0-9a-fA-F]{3,8}$|^rgb|^rgba|^hsl|^hsla/` in `src/**/*.{ts,tsx}`.
  3. Allowlist: `src/theme/**`, `src/index.css`, `src/lib/animation.ts`, `src/config/mapStyle.ts`, anything explicitly tagged with a `// eslint-disable-next-line no-color-literals` comment with justification.
- **AC:**
  - [ ] `npm run lint` enforces the rule
  - [ ] CI blocks PRs that introduce new violations
- **Test:** Add a fixture file with a hardcoded color; verify lint fails. Remove fixture.

### P2-2 — `axe-playwright` in nightly e2e

The 4 a11y violations from the audit are all CI-catchable. Wire it up.

- **Files:** `e2e/`, `.github/workflows/e2e-nightly.yml`, `playwright.config.ts`.
- **Steps:**
  1. `npm i -D @axe-core/playwright` in the e2e package.
  2. Add a per-page test in `e2e/a11y.spec.ts` that visits each major route and runs `await new AxeBuilder({ page }).analyze()`.
  3. Fail the test on `serious` or `critical` violations.
  4. Skip warn-level for the first month while you triage the existing backlog.
- **AC:**
  - [ ] Nightly job runs axe across home, /venues, /events, /news, /marketplace, /cities, a venue detail, an event detail, a news article
  - [ ] Failures post a comment on the relevant PR or open an issue
- **Test:** Run the suite locally; expect the 4 known violations to surface.

### P2-3 — Mobile-viewport e2e screenshots

Chrome MCP can't resize viewports cleanly, but Playwright can. Catch responsive regressions automatically.

- **Files:** `e2e/visual-mobile.spec.ts`, `playwright.config.ts`.
- **Steps:**
  1. Add a Playwright project with `viewport: { width: 390, height: 844 }` and `deviceScaleFactor: 3`.
  2. For each major page, capture a full-page screenshot and compare against a baseline.
  3. Use Playwright's built-in `toHaveScreenshot()` with a 1% pixel-diff threshold.
- **AC:**
  - [ ] Mobile screenshots committed for home, /venues, /events, /news, /marketplace, /cities
  - [ ] CI fails on >1% pixel diff
- **Test:** Run locally; commit baselines; intentionally break the layout and confirm CI fails.

### P2-4 — Component snapshot tests for the design system

Every shadcn-as-MUI wrapper in `src/components/ui/*.tsx` should have a snapshot covering its variants and states.

- **Files:** `src/components/ui/__tests__/*.test.tsx`.
- **Steps:**
  1. For each wrapper component (button, card, badge, input, dialog, alert, avatar, ...), write a vitest test rendering each variant.
  2. Snapshot the rendered HTML and computed styles for `borderRadius`, `boxShadow`, `borderWidth`.
  3. Assert: `borderRadius === '0px'`, `boxShadow === 'none'`, `borderWidth === '0px'` (the system's three flat rules).
- **AC:**
  - [ ] Every component in `src/components/ui/` has a test file
  - [ ] Tests run in `npm test` and assert flat compliance
- **Test:** Intentionally break flatness on one component (`borderRadius: 4`); confirm test fails.

---

## Phase 3 — Accessibility fixes (instance-level)

Quick wins. All four violations from the audit, with explicit fixes.

### P3-1 — Label all form inputs

Three inputs on the homepage have no accessible name (audit probe found 2/5 unlabeled, plus the placeholder-only `Search map…`).

- **Files:** Homepage component, map search component, search-input-typed.
- **Steps:**
  1. For each `<input>` without a label, add `aria-label="…"` describing its purpose.
  2. Map search → `aria-label="Search map locations"`.
  3. Hidden/decorative inputs → add `aria-hidden="true"` and `tabindex="-1"` if they shouldn't be in tab order.
- **AC:**
  - [ ] axe-playwright reports 0 input-label violations on home, /venues, /events
  - [ ] `getComputedStyle().getPropertyValue('aria-label')` non-empty for every visible input

### P3-2 — Name icon-only buttons

One button has no `aria-label` and only an SVG icon.

- **Files:** Find via the audit's button breakdown — likely `src/components/header/*`.
- **Steps:**
  1. Identify the offending button (search for `<MuiButton ... text Inherit>` with no children text).
  2. Add `aria-label` describing the action.
- **AC:**
  - [ ] All icon-only buttons have `aria-label`
  - [ ] axe reports 0 `button-name` violations

### P3-3 — Fix search input visual truncation

The header search shows `Searc |` because the placeholder is being clipped by the cursor's bounding box.

- **Files:** Header search component (search for placeholder `Search` or `Searc`).
- **Steps:**
  1. Measure the actual rendered input width vs. the placeholder text + cursor.
  2. Either widen the input, shorten the placeholder, or add `text-overflow: ellipsis` with `overflow: hidden`.
- **AC:**
  - [ ] Placeholder renders fully across all viewport widths ≥320px

### P3-4 — Geolocate currency correctly

Currency selector defaults to `VND (đ)` for an English locale. Should default to USD/EUR for English, or geolocate properly.

- **Files:** Footer, i18n config, currency context provider.
- **Steps:**
  1. Find the currency-selection logic. Likely uses `Intl.NumberFormat` with a wrong locale-currency assumption.
  2. Default mapping: `en-US` → USD, `en-GB` → GBP, `de`/`fr`/`it`/`es` → EUR, otherwise USD.
  3. Use `navigator.language` + IP geolocation (Cloudflare provides `cf.country` headers via Workers) for the initial value.
- **AC:**
  - [ ] English-locale Swiss visitor sees CHF or EUR, not VND
  - [ ] User's manual selection persists in `localStorage`

---

## Phase 4 — Information architecture & navigation

These are bigger UX calls than Phase 0–3. Get product/design alignment before shipping.

### P4-1 — Surface primary nav on desktop

At ≥1024px, primary categories (Venues, Events, News, Marketplace, Hotels, Travel, Community, Resources) should be visible — not hidden behind a hamburger.

- **Files:** Header component.
- **Steps:**
  1. Add a horizontal nav bar between the logo and the action buttons, visible at `md` (≥900px) and up.
  2. Hide on mobile; keep the burger as the mobile-only toggle.
  3. Use the existing `--cat-*` tokens (or just brand magenta on hover).
- **AC:**
  - [ ] All 8 categories reachable without opening the burger on desktop
  - [ ] Active route is visually marked
  - [ ] Tab order: logo → search → nav → action buttons → utility icons → burger (mobile only)

### P4-2 — Move dark/light toggle to header

Currently footer-only. Per CLAUDE.md, "manual toggle" is a stated capability — it should be discoverable.

- **Files:** Header component, theme provider.
- **Steps:**
  1. Add a sun/moon icon button to the header utility cluster (next to the shield/admin/burger).
  2. Wire to the existing `useTheme` / `useColorScheme` hook.
  3. Persist in `localStorage` (already done?) — verify.
- **AC:**
  - [ ] Toggle visible on every page in the header
  - [ ] State survives page refresh

### P4-3 — Consolidate Submit/Contribute CTAs

`/venues` shows `Contribute`, `+Submit Venue` (top), and `+Submit` (right) simultaneously — three CTAs to the same conceptual action.

- **Files:** Header, page-level toolbars on /venues, /events, /marketplace.
- **Steps:**
  1. Pick one canonical pattern: header has `+Contribute` (always), page-level toolbars have no separate Submit button.
  2. `Contribute` opens a modal with the right submission type pre-selected based on current route.
- **AC:**
  - [ ] Each page has exactly one Submit/Contribute affordance
  - [ ] Click → contextual modal (Submit Venue on /venues, Submit Event on /events, etc.)

### P4-4 — Disambiguate header utility icons

The `T` pink-square and shield icons in the header have no labels. Users can't tell what they do.

- **Files:** Header component.
- **Steps:**
  1. For each utility icon, add an `aria-label` (P3-2 covers this for a11y) AND a visible tooltip on hover.
  2. Audit whether all 6 icon-only header controls are necessary, or if some can be moved to the burger.
- **AC:**
  - [ ] Hover on each header icon shows a tooltip
  - [ ] No more than 4 icon-only controls in the header

---

## Phase 5 — Documentation

The system is well-architected at the token layer; nobody can tell because there's no spec.

### P5-1 — Build a public pattern library page

`src/pages/PatternLibrary/patterns/{desktop,mobile}.tsx` already exists. Surface it.

- **Files:** `src/pages/PatternLibrary/*`, `src/App.tsx` route.
- **Steps:**
  1. Add a route `/pattern-library` (public, or auth-gated to staff — your call).
  2. Render every component variant: Button × 7 variants × 4 sizes × 4 states. Card × hoverable/static. Badge × 4 variants. Input × focused/disabled/error. Etc.
  3. Show the design tokens visually: a swatch grid for colors, a typography scale, a motion-token demo strip.
- **AC:**
  - [ ] `/pattern-library` renders every component in `src/components/ui/`
  - [ ] Each component shows source location and import statement
  - [ ] Tokens (color, typography, spacing, motion) are visually documented

### P5-2 — Document the shadcn-as-MUI-wrapper architecture

CLAUDE.md says "MUI 7 + 50 shadcn/ui components" — but they're MUI wrappers wearing the shadcn API. New engineers will be confused.

- **Files:** `src/components/ui/README.md` (new), CLAUDE.md.
- **Steps:**
  1. Write a 1-page README: what these components are, why they wrap MUI, when to add a new one, when to use raw MUI vs. the wrapper.
  2. Update CLAUDE.md's Architecture section to match.
- **AC:**
  - [ ] `src/components/ui/README.md` exists and explains the pattern in ≤500 words
  - [ ] CLAUDE.md no longer claims vanilla shadcn

### P5-3 — Per-component spec sheets

Each component in `src/components/ui/` should have a sibling `.md` file documenting variants, props, states, accessibility, and do/don't.

- **Files:** `src/components/ui/<name>.md` × 50.
- **Steps:**
  1. Use the audit's per-component table format as the template.
  2. Generate a stub for each via a script; fill in by hand or with Claude Code.
- **AC:**
  - [ ] Every `.tsx` in `src/components/ui/` has a sibling `.md`
  - [ ] Each `.md` covers: variants, sizes, states, props, a11y, do/don't, code example

### P5-4 — Update CLAUDE.md design section to match reality

Several claims in `CLAUDE.md` don't match the prod DOM:
- "Inter (body + headings)" — Plus Jakarta Sans is also loaded
- "monochrome + single accent" — admin uses 11 hues
- "Strict flat: 0 radius, 0 borders, 0 shadows, 0 underlines" — non-zero radii and shadows observed
- "Icons inline in text flow, never in separate containers" — many places violate this

- **Files:** `CLAUDE.md`.
- **Steps:**
  1. After P1-1 through P1-5 land, re-audit and rewrite the Design section to describe what actually ships.
  2. Add a "Documented Exceptions" subsection (admin palette, error/warning palette, etc.).
- **AC:**
  - [ ] CLAUDE.md design section is verifiable — every claim can be checked against a computed style

---

## Phase 6 — Component-level refinement

Lower priority polish.

### P6-1 — Add loading state to Button

`src/components/ui/button.tsx` exposes 7 variants and 4 sizes but no loading state. Standard requirement.

- **Files:** `src/components/ui/button.tsx`, `button.md` (after P5-3).
- **Steps:**
  1. Add `loading?: boolean` prop.
  2. When true, disable the button and show a spinner (use `<Loading>` from `src/components/ui/loading.tsx`).
  3. Maintain button width during loading to prevent layout shift.
- **AC:**
  - [ ] `<Button loading>Save</Button>` renders a disabled button with a spinner
  - [ ] Width preserved across loading transitions

### P6-2 — Standardize empty/loading/error states

The system has good components for content (Card, CardImage) but no standard pattern for empty lists, loading skeletons, or error retries.

- **Files:** `src/components/ui/EmptyState.tsx` (exists), no equivalent for loading-list or error-retry.
- **Steps:**
  1. Build `<LoadingList />` — renders N skeleton cards based on the same Card grid the page uses.
  2. Build `<ErrorRetry />` — error message + retry button + brand-colored icon.
  3. Use these on every list page (Venues, Events, News, Marketplace, etc.).
- **AC:**
  - [ ] Three new components exist and are documented
  - [ ] Every list page uses them in place of ad-hoc loading divs

### P6-3 — Dedupe and sort venue card placeholder logic

Multiple pages have their own image-fallback logic. Centralize on `CardImage`.

- **Files:** All consumers of venue/event/marketplace cards.
- **Steps:**
  1. `grep -r 'fallbackIcon\|src=\".*placeholder' src/` to find all fallback patterns.
  2. Replace with `<CardImage src={img} alt={name} fallbackIcon={MapPin} />`.
- **AC:**
  - [ ] All card-image fallbacks go through `CardImage`
  - [ ] No more "generic pin SVG" placeholders shipped from page-level components

### P6-4 — Auto-fix duplicate event detection

Two adjacent "Drag Show: Saturday Drag Brunch at Hamburger Mary's" cards on /events suggest a dedupe failure.

- **Files:** `supabase/functions/pipeline-deduplicate/`, events table indexes.
- **Steps:**
  1. Inspect the dedupe key for events. Likely uses title + venue + date.
  2. If duplicates with the same venue+date are slipping through, tighten the fingerprint.
  3. Backfill: a one-shot script in `scripts/dedupe-events.ts` to merge existing duplicates.
- **AC:**
  - [ ] No two events with same `title + venue_id + start_date` in `events` table
  - [ ] Pipeline rejects new duplicates

---

## Estimated effort

| Phase | Tasks | Rough effort | Parallel? |
|---|---|---|---|
| Phase 0 — Bleeding | 6 | 2 days each, 12 days total | Yes (6 engineers in parallel) |
| Phase 1 — Tokens | 6 | 1–3 days each, ~10 days | Yes |
| Phase 2 — Enforcement | 4 | 2 days each, ~8 days | Mostly |
| Phase 3 — A11y instance | 4 | 0.5 days each, ~2 days | Yes |
| Phase 4 — IA/nav | 4 | 2 days each, needs design alignment | After review |
| Phase 5 — Docs | 4 | 1–5 days each, ~10 days | Yes |
| Phase 6 — Polish | 4 | 1–2 days each | Yes |

**Critical path:** Phase 0 → Phase 1 → Phase 2 (enforcement only matters after the cleanup). Phases 3–6 can run in parallel with each other once Phase 1 starts.

---

## Definition of done for the whole plan

- [ ] All Phase 0 tasks shipped to production
- [ ] `npm run lint` enforces no-hardcoded-colors with 0 warnings
- [ ] axe-playwright passes on every public route in nightly CI
- [ ] Mobile screenshots committed and CI-enforced for top 6 pages
- [ ] `/pattern-library` is publicly reachable and renders every component
- [ ] CLAUDE.md design section is accurate (each claim verifiable against a computed style)
- [ ] Audit score (per the rubric in the audit doc) ≥ 85/100
