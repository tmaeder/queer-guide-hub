# Search Features QA Sweep — 2026-04-30

Manual visual e2e walkthrough of every user-facing search surface, run via
the Playwright MCP browser against `npm run dev` (localhost:8080).

Sandbox caveat: outbound TLS to vercel-scripts.com / supabase.co fails in
this environment with `net::ERR_CERT_AUTHORITY_INVALID`. Network-dependent
features therefore exercise their *empty / error states* rather than their
happy paths. Findings about UI structure and error handling are still valid;
findings about specific search results are not.

Captured screenshots: `.playwright-mcp/search-test/01-…13-…png` (gitignored
artifact dir; reproduce locally to regenerate).

## Surfaces covered

| # | Surface | URL | Result |
|---|---------|-----|--------|
| 1 | Header search input + suggestions popover | `/` | Functional; UX nit (see #UX-1) |
| 2 | Site-wide search results page | `/search?q=…` | Functional with filters drawer |
| 3 | Search filters drawer (basic + advanced) | `/search?q=…` → Filters | Comprehensive; missing one filter (see #PRODUCT-1) |
| 4 | "Cmd+K" shortcut | any page | Doesn't open a separate palette (see #DOC-1) |
| 5 | `/events` page-local search + filter chips | `/events` | Good UX |
| 6 | `/venues` page-local search + chips | `/venues` | Good UX (one transient flake, see #BUG-1) |
| 7 | `/news` page-local search | `/news` | Good UX |
| 8 | `/marketplace` page-local search | `/marketplace` | Functional; UX inconsistency (see #UX-2) |

## Findings

### #UX-1 — Header search masks error state as "No results"

When the search-proxy fetch fails (in this sandbox: TLS chain error; in
production: 5xx, network blip, etc.), the header suggestions popover
renders the same `"No results found for 'berlin'"` empty state as a
genuine zero-hit query. Users have no way to distinguish "your query
matched nothing" from "we couldn't even ask the search service."

Compare with `/events`, `/news`, `/marketplace`, `/venues` which all
render a distinct *"Failed to fetch …"* state with a Retry CTA. Header
search should do the same — the suggestions popover is the only place
this regression hides.

Fix sketch: in `UniversalSearchBar.tsx`, surface `useSearch()`'s `error`
distinctly from `results.length === 0`. Suggested copy: *"Couldn't reach
search right now. [Retry]"* with the same red treatment as the page-level
banners.

### #UX-2 — `/marketplace` error hides page chrome; `/news` keeps it

When the listing fetch fails:

* `/news` keeps the search box, sort dropdown, view toggle, and Filters
  button visible, then renders an inline red banner *"Failed to load
  articles. Please try again."* below the toolbar. Users can still
  refine their query and retry.
* `/marketplace` replaces the entire page body with a card containing
  *"Something went wrong while loading the marketplace. Please try again."*
  + Retry button. The header (search input + Submit Product CTA) survives
  but everything else is gone.
* `/events`, `/venues` follow the `/news` pattern.

The marketplace pattern is the odd one out. Worth aligning to the news
pattern so users can still tweak inputs without an extra click.

### #PRODUCT-1 — `cluster_ids` not surfaced in the search filters UI

PR #225 added `cluster_ids` to `filterableAttributes` on every Meili index
and `master_event_id` as `distinctAttribute` on the events index. The
backend supports cluster-scoped browse queries.

The filters drawer at `/search?q=…` exposes:

```
Content Types: Venues / Events / Marketplace / Users / News / Locations /
               Wiki / Travel / Personalities / Resources
Location:      Enter city, state, or country
Categories:    Restaurant, Bar, Hotel, Club, Gallery, Theater, Concert,
               Festival, Workshop, Conference, Sports, Art
(advanced):    Date Range / Price Range / Min Rating / Featured / Verified
```

There's no "Cluster" or "Topic" filter. Users can land on a cluster's
storefront URL (when one exists), but they can't pick a cluster from the
filter panel to constrain a free-text search by it.

This is a real product gap — the topic clusters infrastructure (`#171`
helpers, `#174` Meili field, `#225` filterable setting) exists end-to-end
on the backend but doesn't reach this UI. Adding a Cluster picker that
queries `topic_clusters` and applies `cluster_ids` to the search call
would close the loop.

### #BUG-1 — Transient `TextType.tsx:67` crash unmounts the React tree

Observed once: navigating from the `/search?q=berlin` results page to
`/venues` while a fresh dev-server tab was loading produced a
`TypeError: Cannot read properties of undefined (reading 'length')` at
`src/components/ui/TextType.tsx:67:54`. The error chained up through the
React commit phase and the entire `<div id="root">` was unmounted —
`bodyHeight: 0`, no `<main>` element, completely white viewport.

A second navigation to the same URL rendered correctly with no
TextType-related error. The crash didn't reproduce on subsequent loads.

Most likely causes:

1. **HMR race condition** during a reload while the i18n bundle was still
   loading; `t('search.placeholders.venues', 'Search venues...')` returned
   undefined, the `placeholders` array contained an undefined element, and
   `executeTypingAnimation()` indexed into it.
2. **No error boundary** above the page tree. If a small typing-animation
   component can take down the entire app, the error boundary surface is
   too coarse.

Defensive fix sketch:

```tsx
// TextType.tsx — top of the typing useEffect
const currentText = textArray[currentTextIndex];
if (currentText == null) return; // bail out, don't crash
const processedText = reverseMode
  ? currentText.split('').reverse().join('')
  : currentText;
```

…plus tightening the `placeholders` filter at the SearchInputTyped call
sites to drop falsy entries before passing through.

### #DOC-1 — `e2e/a11y-dialogs.spec.ts:60` test name "search command palette (cmd+k)" is misleading

The test labels itself *"search command palette (cmd+k)"* but actually only
focuses the header search input and a11y-scans the suggestions popover.
There is no separate ⌘K palette in the codebase; pressing ⌘K (or Ctrl+K)
on the home page focuses the rotating search box, nothing more. Either:

* The test name should change to *"search suggestions popover"*, OR
* A genuine ⌘K palette should be implemented (out of scope here).

Renaming is the obvious cheap fix.

## Things that work well

* **Search results page** (`/search?q=…`) — clean empty state with six
  suggested-query chips ("Berlin venues", "Pride events", "Drag shows",
  "LGBTQ+ history", "Queer artists", "Safe spaces"). Helps users recover
  from a zero-hit query.
* **Filters drawer** is comprehensive: Content Types (10 entity tabs),
  Location, Categories, plus Date / Price / Rating / Featured / Verified
  in advanced.
* **Active-filter chips** on `/events` (e.g. "Search: pride [×]") give
  immediate feedback on what's filtering and let users remove.
* **Per-page tag chips** on `/venues` (bar, restaurant, cafe, club, hotel,
  bookstore, gym, salon, healthcare, sauna) are a nice quick-filter UI on
  top of free-text search.
* **Page-level error banners** on `/events`, `/news`, `/venues` are
  distinct from empty states and have Retry CTAs. Good defensive UX.

## Out of scope

* **Search proxy semantics** — couldn't exercise hybrid keyword+semantic
  ranking, synonym expansion, or per-locale re-ranking from the sandbox
  (TLS chain). Verify in CI/preview.
* **Authenticated admin search-intelligence pages** — `/admin/search-intelligence`
  requires admin storageState; not tested here.
* **Mobile viewport** — desktop only this run; placeholders rotate and
  filters drawer behaves differently below 768px.
