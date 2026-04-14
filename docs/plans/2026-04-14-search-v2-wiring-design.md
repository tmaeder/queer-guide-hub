# Search v2 wiring — design

Date: 2026-04-14
Status: Approved (Approach C — Provider + atomic hooks + drop-in widgets)

## Goal

Wire `trackSearchEvent`, `submitFeedback`, `fetchSimilar`, `fetchTrending` from
`src/lib/searchClient.ts` (PR #21) across the queer.guide UI to:
- Heat up the personalization bias vector via implicit + explicit signals
- Surface discovery features (similar / trending) without per-page boilerplate
- Establish a quality feedback loop (thumbs up/down)

## Architecture

- **One provider** auto-fires `view` events on route change → zero per-page changes for view tracking.
- **Atomic hooks** for explicit user actions (`useTrackClick`, `useSaveAction`, `useFeedbackVote`, `useBookingTracker`).
- **Drop-in widgets** for discovery surfaces (`<SimilarItems>`, `<TrendingStrip>`, `<TrendingByType>`, `<RecommendedForYou>`).
- **Onboarding page** for cold-start prefs.

## New files (~8, ~600 LOC)

```
src/providers/SearchTelemetryProvider.tsx
src/hooks/useSearchActions.ts
src/components/discovery/SimilarItems.tsx
src/components/discovery/TrendingStrip.tsx
src/components/discovery/TrendingByType.tsx
src/components/discovery/RecommendedForYou.tsx
src/components/search/SearchResultCard.tsx     // extract + add 👍👎
src/pages/onboarding/SearchPersonalization.tsx
```

## Edited files (~15, ~3 lines each)

```
src/main.tsx                                       provider mount
src/pages/Index.tsx                                homepage widgets
src/pages/{Venue,Event,City,Personality,
           QueerVillage,News}Detail.tsx            <SimilarItems entity={...} />
src/pages/Events.tsx                               <TrendingByType type="event" />
src/components/{venues,events}/
    {VenueCard,EventCard,*FavoriteButton}.tsx     useTrackClick + useSaveAction
src/components/search/UniversalSearchBar.tsx       trackClick on result selection
src/hooks/useSearchSuggestions.tsx                 trackSuggestionClick
src/pages/ProfileSettings.tsx                      onboarding entry point
src/pages/BookingsPage.tsx, HotelDetail.tsx        useBookingTracker on success
```

## Telemetry provider

Single mount in `src/main.tsx` after `<BrowserRouter>`. Watches `useLocation()`,
matches against `ENTITY_ROUTES` regex table:

```
/venues/:slug              → view venue
/events/:slug              → view event
/cities/:slug              → view city
/countries/:slug           → view country
/personalities/:slug       → view personality
/queer-villages/:slug      → view queer_village
/news/:slug                → view news
/tags/:slug                → view tag
```

For each match:
1. Resolve `slug → id` via Supabase REST (cached in memory).
2. Debounce 1s — fast nav doesn't flood.
3. Dedup per session — no duplicate `view` if same id viewed within 5min.
4. Fire `trackSearchEvent("view", { type, id }, { city, slug })`.

## Atomic hooks (`src/hooks/useSearchActions.ts`)

```ts
useTrackClick()       → (entity, source) => void
useSaveAction(entity) → { isSaved, save, unsave }
useFeedbackVote()     → (entity, "up" | "down", query?) => void
useBookingTracker()   → (entity, metadata?) => void  // fires "book"
```

`useSaveAction` is the wrapper around existing favorite logic — internally still
upserts to the appropriate `*_favorites` Supabase table AND fires `track`.

## Discovery widgets

| Component | Surface | Behavior |
|---|---|---|
| `<SimilarItems entity={{type,id}} limit={6} />` | Bottom of any detail page | Calls `fetchSimilar()`; renders horizontal scroller of 6 cards; client-side cache 5min. |
| `<TrendingStrip city? limit={10} />` | Homepage, City pages, Map sidebar | Calls `fetchTrending(["venue","event"], city)`; horizontal cards. |
| `<TrendingByType type="event" />` | Events list page header | Calls `fetchTrending([type])`; type-filtered. |
| `<RecommendedForYou />` | Homepage when authed, Favorites tab | Calls `/search` with empty query → falls back to popularity + bias. Skip render if no bias yet. |

All widgets accept `className` for layout flexibility, render skeleton on load,
hide on error (graceful degradation).

## Onboarding page

`src/pages/onboarding/SearchPersonalization.tsx` — 3 steps in a single page:

1. **Vibes** — chip multi-select from controlled vocab: cruisy, artsy, mixed, leather, family-friendly, sober, kink, drag, intellectual, queer-femme, trans-friendly, alternative, cozy, dance-floor.
2. **Home city** — autocomplete via `fetchAutocomplete(query, ["cities"])`.
3. **Languages** — toggles EN / DE / ES / FR (default user's browser lang).

Submit → `submitOnboarding(userId, { vibes, home_city, languages })`.

Routed at `/onboarding/search`. Triggered:
- Post-signup (push from auth callback)
- From `ProfileSettings.tsx` → "Personalize search" panel link
- One-time banner on Index for users with no `interests` set

## Wiring map

| Signal | Source | Calls |
|---|---|---|
| Page view | router → provider | `trackSearchEvent("view")` |
| Card click in list | VenueCard / EventCard onClick | `useTrackClick()(entity, "card")` |
| Search result click | SearchResultCard onClick | `useTrackClick()(entity, "search")` |
| Autocomplete pick | useSearchSuggestions onSelect | `trackSuggestionClick()` (already exported) |
| Favorite toggle | *FavoriteButton | `useSaveAction(entity).save()` |
| Booking confirmed | BookingsPage success | `useBookingTracker()(entity)` |
| Thumbs up/down | SearchResultCard | `useFeedbackVote()(entity, "up"\|"down")` |
| Dismiss / hide | (future, not in scope) | `track("dismiss")` |

## Rollout order

1. **Provider + telemetry** — auto view tracking starts immediately.
2. **Save action hook + favorite button rewrites** — bias vector heats up.
3. **`<SimilarItems>` on detail pages** — visible discovery feature.
4. **`<TrendingStrip>` on homepage** — homepage feature surface.
5. **Feedback thumbs on search results** — quality loop.
6. **Onboarding flow + entry points** — cold-start fix.

Each step is independently shippable (small PRs).

## Out-of-scope (follow-ups)

- "Hide / not interested" UI (would map to `dismiss` event)
- Multi-vector bias (separate vibe vector + content vector)
- A/B harness for personalization on/off
- Recommendation explanations ("Because you saved Schwuz")
