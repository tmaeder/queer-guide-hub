# InstantSearch Popover — Two-Pane Redesign

**Date:** 2026-05-20
**Status:** Approved design, ready for planning/execution
**Scope:** `src/components/search/UniversalSearchBar.tsx` (+ small additions to `SearchScopeChips`, `useSearchSuggestions`, `useTrendingSuggestions`)
**Approach:** B — Two-Pane Raycast layout

## Problem

Current popover (600px fixed, anchored left) has eight UX issues:

1. Scope chips overflow horizontally, last chips cut off
2. Popover width doesn't match search bar width — visual disconnect
3. Sparse results leave large empty space; no thumbnails to scan
4. "xcx" returns 2 events, misses obvious matches (Charli XCX personality)
5. Footer kbd hints cluttered on small surface
6. Bottom "Search for X" black button feels heavy
7. Group headers duplicate scope chips (Events shown twice)
8. Type-grouping fragments the result list when relevance > category matters

## Solution at a Glance

Two-pane popover modeled on Raycast/Linear:
- **Left rail (160px):** Recent (3) + scope list with live counts + Near me / Browse all
- **Right pane (~640px):** sticky header (count + filters) → flat results with 48×48 thumbnails → empty-state grid when no query
- Footer with kbd hints only (28px); bottom CTA button removed (Enter does the job)
- Mobile: unchanged fullscreen sheet, scope rail collapses to segmented horizontal strip

## Section 1 — Layout & Structure

**Desktop**
- Popover width: `min(800px, calc(100vw - 32px))`
- Two columns: rail 160px · 1px divider · results fills rest
- Anchored to search input left edge
- Height: `min-content`, cap `min(560px, calc(100vh - 120px))`
- Border, monochrome, radius 0

**Mobile (<768px)**
- Fullscreen sheet (kept)
- Rail → horizontal segmented chips at top (reuse `SearchScopeChips` + counts)
- Single-pane

## Section 2 — Scope Rail

Order top-to-bottom:

```
RECENT (max 3)
  ⏱  charli xcx                 ✕
  ⏱  berlin bars                ✕
  ⏱  pride 2026                 ✕
  Clear
─────────────
SCOPES
  ◎  All           14
  📍 Venues         5
  📅 Events         4
  🌐 Cities         1
  🏳️ Countries      —
  👤 Personalities  3
  📰 News           1
  🛍 Marketplace    —
  #  Tags           —
  👥 Members        —
  🏘 Villages       —
─────────────
  ⊕  Near me       (only when empty query & supported)
  ▦  Browse all → (always present)
```

**Rules**
- Counts live from suggestion results; `—` (muted em-dash) when zero
- Counts hidden on empty query
- Clicking scope sets `filters.types` to that single type; All clears
- Active scope: `bg-accent` full row, no left bar (monochrome)
- 0-result scopes dimmed `opacity: 0.5`, still clickable
- Synthetic "All" scope = first row, total of all types
- Icons reuse existing `TYPE_ICONS` map, 14×14, muted

**Decisions locked**
- (a) All = default scope
- (b) Recent capped at 3
- (c) Number-key shortcuts via `Alt+1..9` included

## Section 3 — Results Pane

**Sticky header (32px)**
- Left: `"xcx" — 14 results` (or `All venues` etc. on empty query)
- Right: `⚙ Filters` button (opens existing `SearchFiltersPanel` inline below), active count as `Filters · 2`

**Row (52px)**

```
[48×48 thumb] Title with <em>highlight</em>          [type icon]
              Subtitle · city · country
```

- Thumbnail 48×48 square, monochrome border, `bg-muted` fallback
  - Venue/event/marketplace/news: cover/hero image
  - Personality: portrait
  - City/country/village: map snippet or 2-letter code on muted bg
  - Tag/member/group: icon centered in box
- Title 14px / 500, single-line ellipsis. `<em>` = weight 700 underlined (`qg-search-highlight`)
- Subtitle 12px muted, single-line ellipsis
- Type icon right-aligned 14px muted
- Hover/focus: `bg-accent` full row, focus adds 1px inset ring

**Grouping**
- Scope = All: flat list ordered by Meili relevance; no group headers; "See all 47 →" after 12 rows
- Scope = specific: flat list, no headers; "Show more" after 20 rows

**Highlight, prefetch on hover, density**
- Server `<em>` preferred (existing sanitizer kept), client substring fallback
- Hover prefetch via `<link rel="prefetch">` unchanged
- ~9 rows visible × 52px in 480px viewport

**Empty per-scope, loading, error** — see Section 6 edge cases.

## Section 4 — Empty State (no query)

Right pane when input empty + scope = All:

```
TRENDING
[3-column grid, max 6 tiles]
  - 190×112: thumb top (96px), title + meta below
  - Hide section if trending.length === 0

BROWSE
  📍 Places
  📅 Events this weekend
  🌐 Cities
  👤 Personalities
  🛍 Marketplace
```

**Scope ≠ All, no query**
- Top 8 entities of that type by popularity, row format same as Section 3
- Footer link `Browse all {scope} →`

Near me + Recent: rail only (no duplication in right pane).

## Section 5 — Keyboard Model

Input keeps DOM focus. Virtual selection via `aria-activedescendant`. Two virtual rings (rail, results); one active at a time. Default active = results.

| Key | Action |
|---|---|
| ↑ / ↓ | Move within active ring |
| ← | Results → rail |
| → | Rail → results (first row) |
| Enter | Activate focused (scope or open) |
| Tab | Tab-complete top suggestion (kept) |
| Esc | Close + blur input |
| ⌘K / Ctrl+K | Toggle popover |
| Alt+1..9 (⌥1..9) | Jump to scope by index |
| ⌘↵ / Ctrl+↵ | Open result in new tab |

**Wrap**
- Rail wraps top↔bottom
- Results: no wrap; up at first → focus returns to input (clears virtual selection)

**Scroll-into-view**: both panes, 12px padding from edge.

**Accessibility**
- `aria-controls="qg-search-listbox"` on input (kept)
- Add `aria-activedescendant` pointing to focused row or scope
- Rail + results = `role="listbox"`, rows = `role="option"`
- Live region announces scope change: `Filtering to Events, 4 results`

## Section 6 — Footer, CTA, Edge Cases

**Footer (desktop, 28px)**

```
↑↓ navigate   ↵ open   ⌥1-9 scope   ⇥ complete       Press ↵ to see all results →
```

- 11px muted, single line, no wrap
- Right side hint only when query non-empty
- **Big black "Search for X" button removed** — Enter does the same job
- Filter button moves to results pane header (Section 3)

Mobile footer hidden; top Cancel/Clear strip handles dismissal.

**CTA**
- Enter, no virtual selection → submit search
- Enter, virtual selection → open that entity

**Edge cases**

| State | Behavior |
|---|---|
| Loading first | 3 skeleton rows; rail counts show `…` |
| Loading re-query | Keep stale results dimmed 60%, skeleton overlay top |
| Meili error | Banner row at top of right pane: `Search unavailable. Retry` — rail still usable |
| No results any scope | Centered: `No results for "xcx"` + `Try different keywords` |
| No results current scope | `No {scope} for "xcx"` + `Try All →` link |
| Trending fetch fails | Section hidden silently |
| Voice active | Existing mic state in input |
| Near-me denied | Hide rail row after first denial (localStorage flag) |
| Slow network >500ms | Skeleton shimmer; no spinner |
| Outside click | Close, keep query |
| Route change | Close (existing) |
| Query cleared mid-session | Instantly switch back to empty state |

**Telemetry (additions to `trackSearchUx`)**
- `scope_switch` with `from`, `to`, `via` (click/key/number)
- `popover_dismiss_reason`: escape, outside, route, select
- Pane focus time (rail vs results)

## Out of Scope

- Improving the underlying suggestion ranking (e.g., why "xcx" misses Charli XCX) — separate work in `useSearchSuggestions` / Meili index config
- Saved searches surface — kept in `SavedSearchesMenu`, not in popover
- Filters panel internals — reused as-is

## Implementation Notes

- New component split likely needed: `<SearchPopoverRail>`, `<SearchPopoverResults>`, `<SearchPopoverEmpty>`, parent stays `UniversalSearchBar`
- Counts need addition to `useSearchSuggestions` return: `countsByType: Record<string, number>` (cheap; group already exists)
- Mobile `SearchScopeChips` needs `counts` prop
- Thumbnail URLs already present on most entity types in Meili docs; verify city/country/village fallback path
- Skeleton component lives in `src/components/ui/skeleton.tsx` (existing)
- No new ESLint exceptions needed — all monochrome
