# Pride Calendar — Design

**Date:** 2026-05-23
**Status:** Approved, ready for planning/implementation
**Author:** brainstorming session (tmaeder + Claude)

## Goal

Standalone visual + interactive Pride Calendar at `/pride`. Timeline-first, geographic, deeply filterable. Deep links to Events, Festivals, Venues, Trip Planner.

## Chosen approach

**B — Standalone Pride Calendar site.** Reuses existing `events` rows where `event_type='pride'`, no schema migration required for MVP. Considered and rejected:
- **A (filter subview of `/events`):** too shallow, doesn't feel like a destination.
- **C (pride-as-festival-overlay with new `pride_editions` aggregate):** clean model but heavy schema work + backfill upfront. Deferred to Phase 2.

## Information architecture

| Route | Purpose |
|---|---|
| `/pride` | Global calendar overview, current year default |
| `/pride/:year` | Year switcher (e.g. `/pride/2026`) |
| `/pride/:slug` | Single pride edition page (Phase 2) |
| `/pride/region/:slug` | Continent-filtered view (Phase 2) |

## Page structure

1. **Hero strip** — year selector (prev / current / next). Counter: "X prides · Y countries · Z weeks in {year}."
2. **Interactive timeline** (centerpiece)
   - Horizontal scrubbable, 12 months across, density-stacked dots per day.
   - Hover/tap → popover (thumb, city, dates, View / Add to trip / Show on map).
   - Click-drag to zoom into a week. Keyboard arrow nav. Sticky "today" marker.
   - Month chips below scroll the timeline.
3. **World map panel** — toggleable, side-by-side desktop / stacked mobile. MapLibre + supercluster. Two-way binding with timeline.
4. **Filters rail** — left on desktop, drawer on mobile.
   - **Time:** month range, week, "this weekend", "next 30 days", "summer"
   - **Geography:** continent, country, city, traveler-safety tier (existing trip safety briefing tiers — locked design exemption)
   - **Type:** parade, festival, week, party, rally, community (existing `pride:*` sub-tags)
   - **Scale:** small / mid / mega (derived from attendance if present, else hidden)
   - **Accessibility:** wheelchair, sober/dry, family, all-ages, BIPOC-led, trans-led (from `unified_tags`)
   - **Distance** from me / from active trip city
   - **Confirmed vs. TBD dates**
5. **Featured editions rail** — curated by `is_featured` flag on events.
6. **By-region accordion** — Europe / Americas / Africa / Asia / Oceania. Each city links to existing `CityDetail`.
7. **Trip-planner integration**
   - Every card + timeline popover: "+ Add to trip" via existing `useActiveTrip().addToTrip`.
   - If active trip has destination + dates, prides inside window get "in your trip window" badge.
   - "Build trip around this pride" CTA — pre-fills new trip with dates ±3 days and host city.
8. **Venues integration** — on edition page show "Host venues" (queer venues in host city) + "Official venues" if `event.venues_ref[]` present. Cross-link to `/venues?city=...`.
9. **News & guides** — pulls related `news_articles` tagged pride + city.
10. **Subscribe + iCal** — `.ics` export of current filtered set + email digest opt-in (existing notification infra).

## Data model

**MVP:** no new tables.
```
SELECT … FROM events
WHERE event_type = 'pride'
  AND start_date BETWEEN :year_start AND :year_end
JOIN cities, countries
LEFT JOIN venues ON venues.id = events.venue_id
```
Lean response shape per row: `{id, slug, title, city, country, lat, lng, start_date, end_date, tags, image_url, is_featured}`. One query feeds timeline + map + list (~200–500 rows/year). TanStack Query cache by year.

**Phase 2:** new table `pride_editions` to model recurring prides as a series — `series_id`, `host_city_id`, `first_year`, `current_event_id`. Enables `/pride/berlin` auto-pointing to current year. Migration after MVP.

## URL state

Search params: `year`, `month`, `region`, `types[]`, `safety`, `scale`, `q`. Pattern matches existing `/events` URL conventions.

## Visual style

Strict monochrome per design system. Timeline dots encode density + selection via **border weight, fill opacity, size** — no hue. Selected = solid black, default = `bg-muted` ring. Cards `rounded-container`, chips `rounded-badge`, no shadows. Inter only. `text-hero` for year, `text-display` for month headers. Motion limited to timeline scrubber + map pan. No decorative animation.

**Safety-tier filter** uses the existing trip safety briefing color tiers (locked user exemption in CLAUDE.md). All other categorical encodings stay monochrome.

## Performance

- Single aggregate query per year, cached by TanStack Query.
- Map clustering via supercluster.
- Map + timeline lazy-loaded; SSR-friendly server query for first paint.

## i18n

New namespace `pride.json` across all 11 langs. Pride event names stay as proper nouns (not translated).

## Phasing

### Phase 1 — MVP
- Routes `/pride`, `/pride/:year`
- Timeline + map + filter rail + featured rail + by-region accordion
- Trip-planner add buttons + "build trip around this pride"
- iCal export
- SEO (sitemap, OG, hreflang)
- i18n `pride` namespace

### Phase 2
- `/pride/:slug` edition pages
- `pride_editions` series table + admin UI
- `/pride/region/:slug` regional pages
- Email digest

### Phase 3
- Personalization (prides for you, based on saved cities + safety prefs)
- Past-edition retros (photo galleries, news lookback)

## Open items for planning phase

- `events` row volume by year — sample query before sizing the single-query approach.
- Confirm attendance field exists / coverage before exposing "scale" filter.
- Decide on slug strategy (`berlin-pride-2026` vs `berlin-2026`) for Phase 2 edition pages.
- Decide whether `is_featured` is reused or a new `pride_featured` flag is added (avoid mixing with generic events featured rotation).

## Out of scope

- Ticketing / RSVPs (handled upstream by event source / external sites).
- User-generated pride submissions (use existing Chrome extension + ingestion pipeline).
- Live attendance / crowd reporting.
