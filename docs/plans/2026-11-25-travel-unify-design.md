# Travel: one flow, two doors

Approved 2026-11-25. Merges `/travel` (Find your escape), `/travel/book` and `/travel/plan` into one wizard on `/travel`.

## Why

- Flights and stays exist twice: the finder's Stay / Getting there steps and `BookNowAccordion`'s tabs, built from different components.
- Three entry points (Inspire, Plan a trip, Book) for overlapping jobs.
- Finder state lives in React only, so refresh, back and share lose it. Book keeps 15 URL params.

## Flow

One wizard on `/travel`. Above it, two doors: **Inspire me** and **I know where I'm going**.

| Door 1 — Inspire me | Door 2 — I know where |
|---|---|
| 1 Mood | 1 Where & when (city, dates, travellers) |
| 2 Choose (ranked packages) | skipped |
| 3 To do | 2 To do |
| 4 Stay | 3 Stay |
| 5 Getting there | 4 Getting there |
| 6 Book | 5 Book |

- Door 2 builds a package from city + dates via `templateFromCity()`, returning the same `TripTemplate` shape the later steps consume.
- Switching doors keeps city and dates.
- Book step lists every partner link (flights, stays, activities, transfers, car hire, insurance) and works signed out. "Save as trip" is secondary and asks for sign-in only when clicked.
- Inspiration rails (Where to go, Neighborhoods, Pride) stay below the wizard.
- Active trip: door 2 is pre-filled from `useTripBookingContext()`; the header's "Continue planning" stays.

## URL state

`/travel?door=know&city=berlin&from=ZRH&checkIn=…&checkOut=…&guests=2&step=stay`

Step and picks move from `useState` to `useSearchParams`.

## Redirects

| Old | New |
|---|---|
| `/travel/book` | `/travel?door=know` |
| `/travel/book?tab=hotels&city=X` | `/travel?door=know&city=X&step=stay` |
| `/travel/book?tab=flights&to=X` | `…&step=getting-there` |
| `/travel/book?tab=activities` | `…&step=to-do` |
| `/travel/plan` | `/travel?door=know` |
| `/travel?intent=book` | `/travel?door=know` |

Other Book params (`checkIn`, `checkOut`, `guests`, `type`, `priceMin`, `priceMax`, `lgbtqOnly`, `hotelCity`, `activityCity`) carry over. `/travel/book` and `/travel/plan` lose their route meta and leave the sitemap.

Nav (`TravelJourneyNav`): 4 items become 2, **Find a trip** and **My trips**.

## Code

Edits:

- `PersonalisedTripPackages.tsx`: door-aware step 1, `templateFromCity`, per-door `WIZARD_STEPS`, URL state.
- Stay step gains Book's queer-friendly toggle, type/price filters and Queer Guide hotels (`fetchHotelsPage` → `HotelCard`).
- To do step gains Book's activity search (`useActivitySearch`).
- Book step becomes the full link list.
- `Travel.tsx`: door chooser; `?intent=book` redirect targets `?door=know`.
- `routes.tsx`, `functions/_lib/routeMeta.ts`, `functions/_lib/appRoutes.json`, `public/_redirects`: redirects.

Deletes: `pages/travel/Book.tsx`, `pages/travel/Plan.tsx`, `BookNowAccordion.tsx`, `TripCockpit.tsx`, `StartTripHero.tsx`.

Kept: `InlineFlightDeals`, `InlineGroundRoutes`, `QueerGuideStays`, `TransferSection`, `useTripBookingContext`.

Dropped: Book's generic travel-deals grid (`useTravelDeals` → `TravelDealCard`). Door 1 covers "somewhere cheap".

## Rollout

1. URL state for the finder. No visible change.
2. Door 2, Where & when, `templateFromCity`, Stay / To do / Book extras. Old pages stay live.
3. Cutover: redirects, 2-item nav, deletes, route meta, sitemap.

Each PR ships green on its own. Rebase PR 1 onto current `main` first: the finder gets several PRs a day.

## Tests

| Existing | Becomes |
|---|---|
| `BookNowAccordion.test.tsx` | Stay / To do / Book step tests (filters, activity search, URL restore) |
| `StartTripHero.test.tsx` | Where & when tests |
| `e2e/travel-book.spec.ts` | Door 2 spec + redirect spec (each old `?tab=` lands on the right step with params kept) |
| `e2e/travel.spec.ts`, `Travel.test.tsx`, `navigation.test.ts`, `routeMetaContract.test.ts`, `rounded-surface-contract.spec.ts` | Updated for 2-item nav and removed routes |

## Analytics

Book's `search` event moves to door 2's results load, so the travel connection funnel (`2026-11-25-travel-funnel-design.md`) counts both doors. `page_view` metadata gains `door: 'inspire' | 'know'`.

## Risks

- `PersonalisedTripPackages.tsx` is 1,506 lines; door 2 adds about 200. Split into step files only if it passes about 1,800.
- External links to `/travel/book?…` are covered by the redirect mapping.

## Changes during build (PRs #5746, #5748, cutover)

- **No activity search in To do, no insurance link, no Queer Guide hotels move.** The activity API only returns a placeholder (the GetYourGuide widget is the live source), `/travel/book` never had insurance, and `QueerGuideStays` already covered our own stays.
- **`/travel/book` redirects to `/travel`, not `/travel?door=know`.** Both the edge and the client redirect drop the old query when the target has its own, so the target stays bare and the finder translates the old keys (`useLegacyTravelParams`): `tab` → step, `city`/`hotelCity`/`activityCity` → `search_cities`, `to` → `cities.major_airport_code`, dates, guests, stay type, queer-friendly. A bare `/travel/book` lands on Inspire me. `/travel/plan` had no query and goes to `?door=know`.
- **No `useTripBookingContext` pre-fill and no `door` in `page_view`.** The `/travel` header already resumes the active trip; Book's `travel_book_now` search event had no reader.
- **Orphans deleted with Book/Plan:** `FlightSearchForm`, `BookingSearchError`, `useMeaningfulTrips`, `useTripBookingContext`.
