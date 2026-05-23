# /cities redesign — map-led split (Approach C)

**Date:** 2026-05-23
**Author:** Tobias + Claude
**Status:** Approved (approach C selected over A/B)
**Scope:** Frontend-only redesign of `/cities` (no DB migrations, no edge functions)

---

## 1. Goal

Replace the current flat 200-card bento grid with a **two-pane, map-led directory**: filterable, virtualized list on the left + interactive `ExploreMap` (existing component, `cities` layer) on the right. Mobile gets a tab toggle.

The page must:
- Triage the catalogue of ~250 cities by **continent**, **equality tier**, and **text search** — URL-shareable
- Show LGBTQ+-relevant signal on every row (host country equality score, venue count, next pride if ≤ 90 days)
- Stay strictly monochrome (functional `equality-scores` scale is the only allowed chromatic exception)
- Not duplicate `/map` — `/map` is layered exploration of venues + events + cities at world-zoom; `/cities` is a **city directory with map context**, city-only

## 2. Current state (what we are replacing)

[src/pages/Cities.tsx](../../src/pages/Cities.tsx) today:
- `PageHero` → single search input → bento mosaic of up to 200 `DirectoryCard` items, server-sorted by `population DESC`
- No filters, no sort control, no URL state, no section headers
- Per-card Pexels edge-function call on mount for cards missing `image_url` (network thrash)
- Editorial whitelist `FEATURED_CITY_WHITELIST` exists in [src/hooks/usePersonalizedCities.ts](../../src/hooks/usePersonalizedCities.ts) but is unused here
- Card forces 14px title (below type scale), uses circular capital/major-city badges, decorative grayscale-on-hover

## 3. Page layout

### 3.1 Desktop (≥ lg, ≥ 1024px)

```
┌────────────────────────────────────────────────────────────────────┐
│ PageHero (compact, size="sm")                                      │
│ Destinations · Cities · 247 cities, ranked by safety + scene       │
├────────────────────────────────┬───────────────────────────────────┤
│ FILTER BAR (sticky)            │                                   │
│ [search…] [Continent ▾] [Eq ▾] │                                   │
│ Sort: [Population ▾]           │                                   │
│ 247 cities · 36 shown · Reset  │                                   │
├────────────────────────────────┤        ExploreMap                 │
│ ▢ Berlin           ★89  142 v. │       (cities layer only,         │
│ ▢ Madrid           ★90   98 v. │        equality-colored pins,     │
│ ▢ Mexico City      ★71   58 v. │        cluster at low zoom)       │
│ ▢ Bangkok          ★34   31 v. │                                   │
│ ▢ Tel Aviv         ★65   44 v. │       (hover row → pin pulse;     │
│ ▢ …  (virtualized)             │        click pin → row scrolls    │
│                                │        into view + highlights)    │
│                                │                                   │
│ Missing a city? [Suggest one] │                                   │
└────────────────────────────────┴───────────────────────────────────┘
```

Column ratio: `lg:grid-cols-[440px_minmax(0,1fr)]`. Left column scrolls; map column stays fixed full-height (`h-[calc(100vh-var(--header-h))]`).

### 3.2 Mobile (< lg)

Two patterns considered:

| Pattern | Pros | Cons |
|---------|------|------|
| Tabs (List \| Map) | Familiar, no overlap | Loses cross-context |
| Bottom-sheet list over map | Apple/Airbnb-style | New component, complex gesture |

**Choice: tabs** — uses existing `Tabs` primitive, no new component, easy to verify.

```
┌──────────────────────────┐
│ PageHero (sm)            │
├──────────────────────────┤
│ [search…]                │
│ [Continent] [Equality]   │
│ Sort: [Population ▾]     │
├──────────────────────────┤
│ ┌──────────┬──────────┐  │
│ │  List ✓  │   Map    │  │   ← Tabs (sticky)
│ └──────────┴──────────┘  │
├──────────────────────────┤
│ ▢ Berlin     ★89  142 v. │
│ ▢ Madrid     ★90   98 v. │
│ ▢ …                      │
└──────────────────────────┘
```

Active tab is URL-persisted via `?view=list|map` (default `list`).

## 4. Component breakdown

All new components co-located under `src/pages/cities/`:

| File | Responsibility |
|------|----------------|
| `src/pages/Cities.tsx` | Orchestrator: parses URL, calls data hook, switches desktop split vs. mobile tabs |
| `src/pages/cities/CitiesHero.tsx` | Compact hero with eyebrow + title + lede + one-line stat (`{n} cities · {m} countries`) |
| `src/pages/cities/CitiesFilterBar.tsx` | Sticky controls. Search input, continent chip-multiselect, equality chip-multiselect, sort `<Select>`, reset, `aria-live` result count |
| `src/pages/cities/CityListPane.tsx` | Virtualized list (`@tanstack/react-virtual`) of `CityListRow`. Hover row → emit `hoveredCityId`. Receives `selectedCityId` from map to scroll into view + highlight |
| `src/pages/cities/CityListRow.tsx` | One-row card: 64px thumb, name (`text-title`), country (`text-13`), equality chip, venue-count, optional pride-soon pill |
| `src/pages/cities/CitiesMapPane.tsx` | Thin wrapper around existing `ExploreMap` forcing `enabledLayers=['cities']` + applying the same filtered city list. Bridges hover/click to/from list |
| `src/pages/cities/CitiesMobileTabs.tsx` | Sticky tab switcher backed by `?view=` URL param |
| `src/hooks/useCitiesDirectory.ts` | Data hook: cities + country.equality_score + continent + venue counts. Returns `{ all, filtered, counts }`. Memoized filter+sort, no per-render thrash |
| `src/hooks/useCitiesUrlState.ts` | Read/write `?q=&continent=&equality=&sort=&view=&city=` with `useSearchParams` + `replace: true` |

Reused as-is:
- `src/components/map/ExploreMap.tsx` (already supports `cities` layer)
- `src/components/discovery/PageHero.tsx`
- `src/components/ui/{Input,Select,Tabs,Badge,ScrollArea}.tsx`

Deleted from the page (still used elsewhere, not removed from repo):
- `DirectoryCard` in cities context
- `BentoSection` import + `BENTO_SPAN_CLASS` constant

## 5. Data shape

### 5.1 Primary query (one round-trip)

```ts
// src/hooks/useCitiesDirectory.ts
supabase
  .from('cities')
  .select(`
    id, slug, name, name_en, name_de, region_name,
    population, image_url, curated_image_url, is_capital,
    latitude, longitude,
    countries:country_id(
      id, name, slug, equality_score,
      continents:continent_id(id, name, slug)
    )
  `)
  .is('duplicate_of_id', null)
  .not('latitude', 'is', null)         // map needs coords
  .not('longitude', 'is', null)
  .order('population', { ascending: false })
  .limit(400);                          // headroom over current 200
```

Cached 15 min via TanStack Query (matches existing `useOptimizedCities`).

### 5.2 Venue counts (one extra batched query)

```ts
supabase
  .from('venues')
  .select('city_id', { count: 'exact', head: false })
  .eq('status', 'approved')
  .in('city_id', cityIds);
```

Aggregate client-side once into `Map<cityId, number>`. Refresh tied to the cities query (same `staleTime`). If this becomes hot, promote to a Postgres view `cities_venue_counts(city_id, count)` in a later PR — not in scope here.

### 5.3 Pride-soon lookup

Reuse the existing `usePrideCalendar` hook (`src/hooks/usePrideCalendar.ts`). Filter to events with `start_date` within next 90 days that have a `city_id`. Build `Map<cityId, Date>` of the nearest upcoming pride per city.

### 5.4 Counts for hero stat

```
const continentCount = new Set(cities.map(c => c.countries?.continents?.id)).size;
const cityCount = cities.length;
```

No separate query.

## 6. URL state

Single source of truth via `useCitiesUrlState`:

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `q` | string | `''` | Text search; trimmed; matched against name + name_en + name_de + region_name |
| `continent` | comma list | `''` | Slugs (`europe,americas`); empty = all |
| `equality` | comma list | `''` | Tier slugs: `excellent` (≥75) / `strong` (50–74) / `mixed` (25–49) / `difficult` (<25) / `unknown` |
| `sort` | enum | `population` | `population` \| `name` \| `equality` \| `venues` |
| `view` | enum | `list` (mobile only) | `list` \| `map` |
| `city` | slug | `''` | Selected city — driven by map-pin click; list scrolls into view + visually highlights |

All writes use `setSearchParams(next, { replace: true })` to avoid history pile (matches the pattern in `src/pages/Map.tsx`).

## 7. Filter + sort logic

Pure function, memoized in `useCitiesDirectory`:

```ts
function applyFilters(cities, venueCounts, prideByCity, params) {
  const q = params.q.trim().toLowerCase();
  const continents = new Set(params.continent.split(',').filter(Boolean));
  const tiers = new Set(params.equality.split(',').filter(Boolean));

  const filtered = cities.filter(c => {
    if (q && !matchesText(c, q)) return false;
    if (continents.size && !continents.has(c.countries?.continents?.slug)) return false;
    if (tiers.size && !tiers.has(tierFor(c.countries?.equality_score))) return false;
    return true;
  });

  filtered.sort(sorterFor(params.sort, venueCounts));
  return filtered;
}
```

`tierFor(score)`:
- `score >= 75` → `excellent`
- `score >= 50` → `strong`
- `score >= 25` → `mixed`
- `score >= 0`  → `difficult`
- `null/undef`  → `unknown`

Sorters:
- `population` — desc, nulls last
- `name` — locale-aware alphabetical
- `equality` — desc by country equality_score, nulls last
- `venues` — desc by `venueCounts.get(c.id) ?? 0`

## 8. Map ↔ list sync

Bidirectional via two callbacks plumbed through the orchestrator:

```ts
// in Cities.tsx
const [hoveredCityId, setHoveredCityId] = useState<string | null>(null);
const [selectedCityId, setSelectedCityId] = useUrlSelectedCity();   // ?city=

<CityListPane
  cities={filtered}
  hoveredCityId={hoveredCityId}
  selectedCityId={selectedCityId}
  onHover={setHoveredCityId}
  onSelect={setSelectedCityId}
/>
<CitiesMapPane
  cities={filtered}
  hoveredCityId={hoveredCityId}
  selectedCityId={selectedCityId}
  onHoverPin={setHoveredCityId}
  onSelectPin={setSelectedCityId}
/>
```

Map behavior:
- `enabledLayers=['cities']` forced — no venue/event layers in the `/cities` map
- When `filtered` changes (filter or sort), fit-bounds to remaining cities only — debounced 200ms
- Pin styling: equality-tier color from the allowlisted `equality-scores` scale (no new colors)
- Hover row → pulse pin via `setFeatureState`
- Click pin → write `?city=slug` → list scrolls into view + row gets `bg-muted/40` + outline-2 outline-foreground/30

List → map: hover dims unselected pins to 30% opacity.

If `selectedCityId` is present on initial mount, fit-bounds zooms to that city.

## 9. CityListRow design

```
┌────────────────────────────────────────────────────────────┐
│ ┌──┐                                                       │
│ │  │  Berlin                              ★ 89  ·  142 v. │ ← title + chip + count
│ │  │  Germany · Europe                    Pride · Jul 26  │ ← sub + optional pill
│ └──┘                                                       │
└────────────────────────────────────────────────────────────┘
  64×64                                                  hover: bg-muted/40
```

- Thumb: `image_url ?? curated_image_url ?? <neutral tile with first letter>` — **no Pexels call from this view**
- Title: `text-title` (22px)
- Sub: `text-13`, muted
- Equality chip: `<EqualityChip score={...} />` — new tiny component, uses `equality-scores` scale, monochrome fallback for null
- Venue count: `text-13`, format `142 v.` (≥ 1000 → `1.4k v.`)
- Pride pill: shows only if next pride within 90 days; format `Pride · Jul 26`
- Whole row is a `LocalizedLink` to `/city/{slug}` — Cmd-click opens detail in new tab
- Hover propagates to map via `onHover`; doesn't navigate
- Selected (`?city=` matches): `bg-muted/40` + outline ring (`ring-1 ring-foreground/20`)

Row height: fixed **84px** (1 image + 2 text lines + 12px padding) → required for `useVirtualizer` `estimateSize`.

## 10. Performance

| Concern | Mitigation |
|---------|------------|
| 250+ DOM rows | `@tanstack/react-virtual` with `estimateSize: 84`, overscan: 8 |
| Pexels-on-mount thrash | Eliminated. List view uses `image_url`/`curated_image_url`/letter tile only. Image enrichment moves to backend job (out of scope) |
| Map re-renders on every list hover | Use uncontrolled `setFeatureState` instead of React state for pin pulse |
| Bounds-fit oscillation under rapid filter changes | Debounce 200ms via `useDebouncedCallback` |
| First paint | Skeleton list (12 row skeletons) + map renders independently with its own loading |
| Bundle | Map page already chunked (`maplibre` manualChunks); list page reuses |

## 11. A11y

- `<h1>` in hero, `<h2>` for the list pane label (`Cities`), `<h2>` for the map pane label (`Map`, visually hidden on desktop, visible on mobile tab)
- Filter group: `role="group" aria-label="Filter cities"` wrapping the chips
- Result count: `<p aria-live="polite" role="status">`
- List rows: `LocalizedLink` (already keyboard-navigable)
- Tabs (mobile): shadcn `Tabs` primitive — already a11y-correct
- Map pins: each has `aria-label="{city name}, equality score {n}"`
- Reduced motion: pin pulse + bounds-fit `flyTo` honor `prefers-reduced-motion: reduce` — `easing: t => 1`, duration 0

## 12. Monochrome compliance

- Equality tier colors come from the **existing** `equality-scores` allowlist in [eslint.config.js](../../eslint.config.js). Not new chromatic exceptions.
- Pin colors on the map: same `equality-scores` palette (already in use on `/map`)
- Everything else: `--foreground` / `--background` / `--muted` / `--accent` / `--border`
- No shadows, no gradients, semantic radius only (`rounded-element` on chips, `rounded-container` on cards)
- Pride pill: `--foreground` border + `--background`, no chromatic fill
- Selected row: `bg-muted/40` + `ring-1 ring-foreground/20` — monochrome

## 13. SEO

- `useMeta` updated: title `Cities · LGBTQ+ Friendly Destinations`, description includes city count
- JSON-LD: `CollectionPage` with `ItemList` of top 50 cities by population (canonical URL each)
- `<h2>` for list + map pane — already had no headings before; net SEO gain
- URL state changes use `replace: true` — only one canonical entry in history

## 14. Files touched

**Created**
- `src/pages/cities/CitiesHero.tsx`
- `src/pages/cities/CitiesFilterBar.tsx`
- `src/pages/cities/CityListPane.tsx`
- `src/pages/cities/CityListRow.tsx`
- `src/pages/cities/CitiesMapPane.tsx`
- `src/pages/cities/CitiesMobileTabs.tsx`
- `src/pages/cities/EqualityChip.tsx`
- `src/hooks/useCitiesDirectory.ts`
- `src/hooks/useCitiesUrlState.ts`
- `src/pages/cities/__tests__/CitiesFilterBar.test.tsx`
- `src/pages/cities/__tests__/CityListRow.test.tsx`
- `src/hooks/__tests__/useCitiesDirectory.test.ts`

**Modified**
- `src/pages/Cities.tsx` — gutted, becomes thin orchestrator
- `src/pages/__tests__/Cities.test.tsx` — rewrite around new shape
- `public/locales/{en,de,fr,es,it,pt,nl,pl,sv,da,cs}/translation.json` — add new keys under `cities.*` (filter labels, tier names, view labels, sort labels, empty states)

**Not touched (intentionally)**
- `src/components/directory/DirectoryCard.tsx` — still used by `/directory`
- `src/components/discovery/BentoSection.tsx` — used by other discovery pages
- `src/components/map/ExploreMap.tsx` — reused as-is
- Any DB migration, any edge function

## 15. Phasing

Single-PR delivery is fine; ~5 atomic commits:

1. **Data hook** — `useCitiesDirectory` + `useCitiesUrlState` + tests (no UI yet)
2. **List pane** — `CityListRow` + `CityListPane` + `EqualityChip` + virtualization + tests; render under existing hero behind a `?view=v2` flag to compare
3. **Filter bar** — `CitiesFilterBar` + URL wiring + tests
4. **Map pane + sync** — `CitiesMapPane` + bidirectional sync + bounds-fit + tests
5. **Mobile tabs + cutover** — `CitiesMobileTabs`, remove `?view=v2` flag, delete old page body, update i18n keys, update `Cities.test.tsx`

Each commit ships green tests + typecheck + lint.

## 16. Test plan

**Unit (vitest + RTL)**
- `useCitiesDirectory` — filter+sort+tier+search produce expected results across fixture cities
- `useCitiesUrlState` — round-trips all params, defaults are correct, `replace: true` used
- `EqualityChip` — tier mapping (75/50/25/null edge cases)
- `CityListRow` — renders title/sub/chip/count/pride pill; selected state classes apply
- `CitiesFilterBar` — toggling chips writes URL; reset clears all but `view`

**Integration**
- `Cities.test.tsx` — full render with mocked supabase: search filters list; continent chip narrows; sort changes order; clicking a row navigates
- Mobile tab swap honors `?view=`

**E2E (Playwright)**
- New spec `e2e/cities-directory.spec.ts`:
  - `/cities` loads list + map on desktop, only list on mobile
  - Typing in search filters both panes
  - Selecting a continent narrows result count
  - Clicking a map pin scrolls + highlights the row
  - URL reflects `?q=`, `?continent=`, `?equality=`, `?sort=`, `?view=`
  - Refresh with `?continent=europe&sort=equality` reproduces filtered+sorted state

**Manual on prod after deploy**
- Verify on `https://queer.guide/cities` (per CLAUDE.md — Cloudflare Pages is the deploy target, Vercel is preview only)
- Test with throttled 3G to confirm no Pexels storm
- Verify dark mode + `prefers-reduced-motion`
- Verify keyboard navigation through chips → list → row

## 17. Risks + mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Bounds-fit + filter interaction causes map jitter | M | Debounce 200ms; never fit-bounds if filter unchanged |
| `ExploreMap`'s `cities` layer expects a specific shape that differs from our query | M | Verify in commit 4; adapter layer if needed |
| Venue-count query slow for 250 cities | L | `count: 'exact'` on indexed `city_id` is fast (< 50ms); fall back to view if regression |
| Virtualization breaks `Ctrl-F` browser search | L | Keep first 50 rows always-mounted (mass `overscan`) OR document expectation |
| Mobile tab pattern feels less powerful than B's grouped-grid | M | Acceptable trade — user explicitly chose C |
| Map column on `/cities` confuses users who expect `/map` | L | Hero copy clarifies; map pane title "Cities map"; layer chip removed (cities-only) |
| Splitting attention from `/map` (CLAUDE.md callout) | M | Tight scope: cities-only layer, no venue/event layers, no layer toggle — visually distinct from `/map` |

## 18. Open questions

None blocking. The following can be deferred:

- Should selected-city pin auto-open a city-preview card (lightweight popover with image + 3 stats)? — **deferred to a follow-up**; the row already links to the full city page
- Should the equality tier definitions live in a shared constant (also used on `/map`)? — **yes, but in a follow-up refactor PR** that touches `/map` too
- Backend cron to backfill `cities.image_url` from Pexels so list thumbs aren't placeholders? — **separate ticket**, unblocks the design but isn't required

## 19. Acceptance

Page ships when:
- Lighthouse perf ≥ 85 (desktop) on staging
- All new tests + existing `Cities.test.tsx` green
- Typecheck + lint clean
- E2E spec passes locally + in nightly
- Manual prod verification on `queer.guide/cities` after CF Pages deploy
- No new ESLint violations from monochrome / spacing / radius guards
