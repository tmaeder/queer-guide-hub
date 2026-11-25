# Travel unify — PR 2: second door and Book step

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The Find your escape wizard gets a second door, "I know where I'm going", that skips Mood and Choose. Its last step lists every booking link and works signed out.

**Architecture:** All in `PersonalisedTripPackages.tsx`, on the URL state from PR 1. Door 2 swaps the Mood chips for `CityCountryAutocomplete`, stores only `dest=<cityId>` and resolves name + country with the existing `useCityIdentity`. `templateFromCity()` builds a `TripTemplate`, so To do / Stay / Getting there / Book run unchanged.

Design: `docs/plans/2026-11-25-travel-unify-design.md`. Old pages stay live until PR 3.

## Changes against the design (measured while planning)

- **No activity search in To do.** The finder's own comment records that the activity API only returns a "browse <city>" placeholder; the existing GetYourGuide widget is the live source. Moving Book's Activities tab would add nothing.
- **No insurance link.** `BookNowAccordion` has no insurance section; the design listed it by mistake.
- **No Queer Guide hotels move.** `QueerGuideStays` already shows our own stays in step 4.

## URL keys added

| Key | Values | Default |
|---|---|---|
| `door` | `inspire`, `know` | `inspire` |
| `dest` | city id | absent |
| `qf` | `1` = queer-friendly stays only | absent |

## Tasks

### Task 1: door chooser, step order, Where & when

- [ ] Failing tests in `PersonalisedTripPackages.test.tsx` (mock `CityCountryAutocomplete` as a "Pick Lisbon" button; mock `useCityIdentity`):
  - "I know where I'm going" shows a city picker, hides Mood and the step bar's Choose, Next is disabled until a city is picked.
  - Picking Lisbon → Next lands on To do for Lisbon (`step=to-do`, `door=know`, `dest=lisbon`); Back returns to Where & when.
  - `/travel?door=know&dest=lisbon&step=stay` restores the Lisbon stay step.
- [ ] Implement:
  - `const [door, setDoor] = url.choice('door', DOORS, 'inspire')`; door chooser = two `FilterChip`s above `WizardSteps`; switching door resets to step 1.
  - `stepAfter(n)` / `stepBefore(n)` skip step 2 in door 2; `step=choose` in door 2 reads as step 1.
  - `templateFromCity(city, days)` (module scope) → `TripTemplate` with `id: city:<id>`, `source: 'preference'`, `event: null`.
  - `best` = door 2 template when `dest` resolves, else today's ranked pick.
  - Step 1 in door 2: `CityCountryAutocomplete` instead of Mood; hide the "Where (optional)" place filter. Seed the identity query cache on pick so the name shows without a refetch.
  - `WizardSteps` gets `door`: door 2 labels step 1 "Where & when" and hides Choose; displayed numbers follow the visible list.
  - Nav bar renders in door 2 step 1 without a package; Next disabled until a city is picked. Skeleton and "Fresh packages are on their way" card stay door-1 only.
  - Summary: the "Mood" fact becomes "Where" in door 2.

### Task 2: queer-friendly stays toggle

- [ ] Failing test: Stay step "Queer-friendly only" chip passes `lgbtqFriendlyOnly: true` to `useHotelSearch` and writes `qf=1`.
- [ ] Implement: `url.choice('qf', ['0', '1'], '0')`, chip after the stay types, pass to `useHotelSearch`.

### Task 3: Book step lists the booking links

- [ ] Failing tests (signed out): step 6 shows a "Book it" list — stay (Booking.com, same URL as step 4), getting there (Trainline for train, FlixBus for coach, Omio for fly/ferry; hidden for drive or without a start), tours (GetYourGuide search for the city). "Save as trip" is secondary and sends signed-out readers to sign-in.
- [ ] Implement: `bookLinks` array in the component from `bookingSearchUrl`, `buildTrainlineUrl`, `buildFlixbusUrl`, `buildOmioUrl`, and a GetYourGuide search URL through `applySubId(…, 'getyourguide', 'trip_suggest')`. Render above the bottom bar. "Build this escape" → `variant="outline"` "Save as trip".

### Task 4: gates and PR

- [ ] `npx vitest run src/components/travel src/hooks/__tests__/useUrlState.test.tsx src/pages/__tests__/Travel.test.tsx`
- [ ] `npm run typecheck`, eslint on touched files
- [ ] Browser: door 2 → pick a city → dates → walk to Book → links open partners; reload keeps everything.
- [ ] Push, PR, auto-merge on green.
