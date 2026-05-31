# Discovery Hub — Menu + Search Redesign

**Date:** 2026-05-31
**Status:** Design approved (direction), pending implementation approval
**Direction:** Hybrid (search-first hub + thin grouped quick-launch row). User modes kept and made prominent.

## Context

The header carries two parallel systems that route to the same ~14 entity types: a
menu (5 primary nav + 9-item "More" dropdown + 8 user-menu links + 6 modes + 5 legal
links) and an already-powerful search (`UniversalSearchBar`: ⌘K, voice, geolocation,
scope chips, faceted filters, trending, recent/saved, full a11y). On mobile this
fragments further into a hamburger drawer + a 5-item bottom nav + a collapsible search
toggle.

Four problems drove this redesign: the menu is cluttered, search is powerful but
hidden/underused, the look is generic, and mobile UX is fragmented. The unifying
insight: **search already indexes everything the menu links to**, so menu and search
are two doors to one discovery system. This design merges them.

Constraints: monochrome design system (no color except `--destructive`, no
gradients/shadows, Inter, 8pt grid, semantic radius trio), factual copy (avoid
"discover/explore/curated/journey" — so no literal "Discover" label), lucide icons,
functional motion only. Reuse existing search components/hooks; YAGNI.

## Design

### Desktop header
- **Row 1 (refined):** logo · large `UniversalSearchBar` (visual centerpiece, ⌘K hint) · `+` contribute · avatar menu.
- **Row 2 (replaced):** remove the 5-tab primary nav and the "More" dropdown. Replace with a **thin grouped quick-launch row** — the 4 clusters below rendered as inline labeled groups of crawlable `<Link>`s (scannable for humans, real `href`s for SEO).

### Cluster model (14 destinations → 4 factual clusters)
| Cluster | Destinations |
|---|---|
| **Places** | venues, places (queer villages), map, hotels, travel |
| **Community** | events, feed, groups, members, personalities |
| **Shop & Read** | marketplace, news, resources |
| **Support** | help (crisis support — kept distinct, non-commercial) |

### The hub (focus/empty state of the search popover)
Reuse `SearchPopoverEmpty` + `SearchPopoverRail`, don't rebuild:
- Rail: Recent + Scopes + Near me (existing).
- Main pane: **Mode switcher** (new, top) → **Trending tiles** (existing) → **"Go to" commands** = the cluster-grouped destinations (the menu, absorbed into search). The old "More" dropdown and user-menu links become commands here.
- No new top-level label; use existing "Browse" / "Go to" headings.

### User modes (kept, prominent)
- New `ModeSwitcher` component built on existing `tabs.tsx` (segmented control, monochrome, `rounded-element`, border-active — no new Radix dependency). Six segments from `USER_MODES`. Lives at top of the hub's main pane (also stays in avatar dropdown for convenience).
- Persists via `updateProfile({ user_mode })`; anonymous users persist to `localStorage` (`qg-user-mode`).
- **Mode biases discovery** via a pure `MODE_SCOPE_BIAS: Record<UserMode, string[]>` map (scope ordering, e.g. dating→people+venues, exploration→places+map, networking→events+groups). Passed into `fetchTrending`/`useTrendingSuggestions` so trending tiles change with mode. Server-side personalization vector keeps learning through existing `/track` calls — no new backend endpoint.

### Mobile model (replaces drawer + bottom-nav + search-toggle)
- **Persistent bottom nav with a central hub action** (`MobileBottomNav`): Home + contextual items + a prominent center Search/Hub button that opens the full-screen hub (`SearchPopoverMobile`, already exists). Removes the header search-toggle and the hamburger.
- **Account screen / sheet:** the user-menu + legal + sign-out + admin links (previously only in the hamburger drawer) move to a `/me` account screen or an avatar-opened `AccountSheet`. The drawer is removed entirely.
- Mobile header becomes: logo + avatar/sign-in only.

## Files

**New**
- `src/config/navigation.ts` — `DESTINATIONS` (14, each tagged `cluster` + optional `searchType`), `NAV_CLUSTERS`, `USER_MENU_ITEMS`, `USER_MODES`, `LEGAL_ITEMS`, `MODE_SCOPE_BIAS`. Single source of truth for quick-launch row + hub commands + mobile.
- `src/components/search/ModeSwitcher.tsx` — segmented mode control.
- (optional) `src/components/layout/AccountSheet.tsx` — absorbs the removed mobile drawer's account/legal items.

**Edited**
- `src/components/layout/Header.tsx` — import arrays from config; remove `moreNav` dropdown + `moreOpen`/`handleMoreNav`; replace row 2 with grouped quick-launch row; strip mobile drawer + `mobileSearchOpen` search-toggle.
- `src/components/layout/MobileBottomNav.tsx` — central hub action; reconcile `ITEMS` with config.
- `src/components/search/SearchPopoverEmpty.tsx` — cluster-grouped "go to" commands from config; mode-biased trending.
- `src/components/search/SearchPopoverDesktop.tsx` + `SearchPopoverMobile.tsx` — mount `ModeSwitcher` atop the hub; thread mode into trending.
- `src/components/search/UniversalSearchBar.tsx` — read user mode; pass mode-biased scope/types into trending; emit mode-change telemetry.
- `src/hooks/useTrendingSuggestions.tsx` — optional `types` ordering param.
- `src/i18n/locales/en.json` — add `nav.clusters.*`; then `npm run i18n:fill` + `npm run i18n:sync`.

**Reused unchanged:** `searchTaxonomy.ts`, `SearchPopoverRail.tsx`, `SearchPopoverResults.tsx`, `SearchScopeChips.tsx`, `SearchFiltersPanel.tsx`, `useSearch.tsx`, `useSearchSuggestions.tsx`, `useSearchHotkey.tsx`, `searchClient.ts`, Footer's theme/language/currency switchers.

## Accessibility
- Preserve existing: `role=combobox`/`aria-controls=qg-search-listbox`, rail `role=listbox`/`option`, Alt+1-9, ↑↓←→ two-pane nav, Esc, `kbd` hints, `role=search` landmark.
- New: `ModeSwitcher` via Radix Tabs (`tablist`/`tab`/`aria-selected`) + `aria-live="polite"` mode-change announcement; grouped quick-launch row wrapped in labeled `<nav>` with real `<Link>`s; mobile center hub button gets `aria-label`/`aria-haspopup="dialog"`/`aria-expanded`/`aria-controls` (mirror current hamburger); keep 44px touch targets.

## Phased rollout
0. **Config extraction** — pure refactor, no UX change. (`navigation.ts`, Header imports it.)
1. **Hub content** — grouped "go to" commands + `ModeSwitcher` inside the existing popover. Additive, low risk.
2. **Desktop header** — replace row 2, remove More dropdown. Behind feature flag (`src/lib/featureFlags.ts`).
3. **Mobile model** — bottom-nav central hub + remove drawer/search-toggle + account screen. Highest risk, flag-gated, ships last.
4. **Cleanup** — remove flag + dead code once verified.

## Verification
- `npm test` (add: `ModeSwitcher` persistence, config-driven go-to rendering), `npm run lint` (enforces design tokens), `npm run build:check`, `npm run i18n:check`.
- Playwright `e2e/`: rewrite `a11y-header.spec.ts` (bottom-nav hub replaces hamburger), extend `search.spec.ts`/`search-ux.spec.ts` (go-to nav, mode-driven trending, keyboard nav intact), refresh `visual-mobile.spec.ts`, add Axe over the open hub.
- Manual check on production (queer.guide) post-deploy: crawlable cluster links resolve, prerendered SEO links present.

## Risks
- No toggle-group primitive — build `ModeSwitcher` on `tabs.tsx` (no new dependency).
- Anonymous mode persistence via `localStorage` (no profile row pre-auth).
- Phase-1 mode bias is client-side ordering only; server vector keeps learning via existing `/track`.
- `MobileBottomNav` "Find" overlaps the new hub — reconcile to a single discovery entry point.
