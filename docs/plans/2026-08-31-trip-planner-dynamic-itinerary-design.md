# Trip Planner — audit and dynamic-itinerary design

**Audit first, design second.** Every number below was measured on the live project
(`xqeacpakadqfxjxjcewc`) on 2026-08-31, or is a file path in this repo. Re-run the queries in
§6 rather than trusting the prose.

---

## §0 — Recommendation, up front

**The brief assumes a static trip planner that needs replacing. That is not what is here.** Four of
the brief's five objectives are already built, several of them well. Auditing them and then
rebuilding them would be the expensive way to produce no change.

What is genuinely missing is **one layer**, and it is the layer the user actually lands on:

> Both paths that create a trip — `/trips/discover` "ride this line" and the `TripTemplates`
> "use template" button — write `trip_places` rows whose `category` is `'city'`. No days, no
> venues, no events, no times. The traveller arrives at `/trips/:id` holding a list of city names
> and an empty itinerary, and every downstream feature (legs, budget, packing, gap detection)
> has nothing to read.

So the work is: **build the day-level generator that turns a city stop into an itinerary**, reuse
the vibe vocabulary that already exists one level up, and delete the static pool that is the only
legacy template artifact in the tree.

Two parts of the brief are declined or reshaped, both stated with reasons in §4.

---

## §1 — What already exists (measured)

The trip surface is large: **42 hooks** (`src/hooks/useTrip*.ts`), **~70 components**
(`src/components/trips/`), 7 pages, 14 edge functions, ~40 migrations.

| Brief objective | Status | Where |
| --- | --- | --- |
| Vibes & themes, pace, multi-city routes | **Built, and good** | `src/lib/lines/generateLine.ts` (23k, pure + seeded), `RoutePicker.tsx`, `/trips/discover` |
| Geography — multi-city / regional | **Built** | `trip_destinations` (`20260525090000`), per-destination date sub-ranges |
| User preferences | **Partial** | `user_travel_preferences` has `budget_tier`, `preferred_transport`, `travel_style` jsonb, home city/country. **1 row live.** |
| POIs from the Queer Guide corpus | **Built** | `TripSuggestions.tsx` → recommendation engine + `useVenueAccessibilityMatches` |
| Contextual product / gear | **Built** | `MarketplaceForTrip.tsx` (city listings + occasion gear), `useTripPackingSuggestions` |
| Group travel & collaboration | **Built** | `trip_members`, `TripPolls`, `CollaborationTab`, `CostSplitSummary`, `TripChat`, `useTripPresence`, `ShareTripDialog` |
| Safety / cultural / practical | **Built** | `TripSafetyBriefing`, `useTripSafety`, `PerLegSafety`, `trip_safety_briefings`, plus the platform-wide `safety_gated` RLS layer |
| Multi-modal transport | **Heuristic, deliberately** | `tripLegs.ts` — 3 modes, constant speeds, Google Maps deep link |
| **Day-level itinerary generation** | **MISSING** | — |

### The substrate for generation was laid down and never wired

`20260526000000_trip_suggest_foundation.sql` created exactly the substrate this design needs, and
then nothing consumed it. Measured:

| Object | Live state | Callers in `src/` |
| --- | --- | --- |
| `itinerary_draft_cache` | **0 rows** | none (only `types.ts`) |
| `detect_trip_gaps(uuid)` | exists | **none** |
| `get_similar_trip_suggestions(uuid,int)` | exists | **none** |
| `city_climate_monthly` | **0 rows** | none |
| `venues.vibe_tags` | **0 rows of 25,178 live venues** | none |
| `venues.day_part` | 34,148 non-empty — **see §2, it is not a signal** | none |

Two of its three indexes were dropped again by `20260810075202_drop_unused_indexes.sql` as unused,
which is the clearest possible evidence the feature never shipped.

### Dead code found

`fetchTripSuggestionVenues` / `fetchTripSuggestionEvents` in `src/hooks/useTripSuggestions.ts` are
the naive `order by foursquare_rating limit 30` path that `TripSuggestions.tsx`'s own header says
was replaced by the recommendation engine. **Their only remaining referent is their own test file.**

---

## §2 — The trap any generator would walk into: `venues.day_part` is stale, not merely thin

A slot-filling itinerary generator's most natural input is `venues.day_part`. **It must not read it
at all.**

The column was backfilled once, in May 2026, by `20260526000000_trip_suggest_foundation.sql`, from
`venues.category` — ending with an unconditional catch-all:

```sql
UPDATE public.venues SET day_part = '{morning,afternoon}'::TEXT[]
  WHERE (day_part IS NULL OR day_part = '{}');
```

Two separate defects follow, and the second is the serious one.

**(a) The catch-all stores "we do not know" as "visit in the morning".** Over the 25,178 live
venues, `{morning,afternoon}` covers **15,833 rows (63%)**, and `venues.category` is `'other'` on
5,409 of the live corpus — so for a large share the value exists because nothing was known.

**(b) It has never been recomputed, and its input has moved underneath it.** `run_venue_category_reclassify`
has been rewriting `venues.category` nightly since 2026-08. `day_part` was derived from the category
as it stood in May and nothing recomputes it. Measured against its own backfill rule:

| current `category` | live rows | rows whose `day_part` contradicts that category |
| --- | ---: | ---: |
| `bar` | 8,526 | **4,375 (51%)** |
| `club` | 1,977 | **1,001 (51%)** |
| `restaurant` | 1,274 | **892 (70%)** |
| `hotel` | 534 | 203 |
| `cruising` | 97 | 67 |
| `cafe` | 775 | 35 |

**Half the bars in the corpus are stored as a morning activity.** A generator that slotted by this
column would build evenings out of cafés and mornings out of leather bars, and would be most
confidently wrong exactly on `nightlife`, the most-picked vibe.

This is the same failure class this codebase has already been bitten by and names explicitly — *"a
derived field written once and never revalidated against the input it was derived from will silently
outlive that input"* (safety notes, 86 cities served another country's law).

**The fix is read-time derivation, not a 15,833-row UPDATE.** `venues` writes fan into the search
sync and the amenity engine's own note says a 32k-row write "would storm the search sync
(disk-constrained DB)". Since `category` is the column that is actually maintained, the candidate-pool
RPC (§3.2) derives the day-part **from the current category on every read** and returns it alongside
an explicit `day_part_known boolean`. A venue whose category carries no day-part signal is returned
as unknown and is never placed on a day-part basis alone — absence stays absence.

Repairing the stored column is worth doing and is deliberately **not** in this change: it needs a
batched runner and an `admin_automations` row, it has no reader once the RPC lands, and bundling a
15k-row write into a feature PR is how the search sync gets stormed. It is filed in §7.

**A second column fails the same way, quietly: `venues.price_range` is non-null on 564 of 25,178
live rows (2.2%), and 562 of those are bars.** Budget therefore cannot gate venue selection — a
budget filter would silently discard 97.8% of the corpus. It is applied as a *soft* signal where
present and the UI says so, rather than being presented as a filter that works.

## §3 — Design

### 3.1 `generateItinerary` — pure, seeded, never pads

New: `src/lib/itinerary/generateItinerary.ts`. It is a deliberate sibling of `generateLine.ts` and
inherits its four conventions verbatim:

- **Pure.** No `Date.now()`, no `Math.random()`, no network, no React. The seed is injected, so the
  same `(pool, input)` always yields the same itinerary — which makes reroll a seed bump rather
  than a refetch, makes it unit-testable, and lets a plan be shared as `?seed=`.
- **It never pads.** If an evening has no eligible venue the slot is returned **empty with a
  reason**, not filled with the nearest cafe. On this corpus a padded plan is not a rounding error;
  it is the thing that makes the surface untrustworthy.
- **It reports its own thinness.** A `DayOutcome` per day and an overall `ItineraryOutcome`, so the
  UI can say "Tuesday evening: 3 bars in this city, none open" rather than silently showing two days
  where five were asked for.
- **Nullability is corrected from measurement, not from the generated types.**

Inputs (`GenerateItineraryInput`):

| Field | Source |
| --- | --- |
| `vibe: VibeId \| null` | **Reused from `generateLine.ts`** — `nightlife \| sauna \| slow \| community \| outdoors`. One vocabulary, not two. |
| `pace: PaceId` | Reused. `slow \| steady \| sprint` → 2 / 3 / 4 slots filled per day. |
| `budget: BudgetTier \| null` | `user_travel_preferences.budget_tier` |
| `accessibilityNeeds: string[]` | `useAccessibilityNeeds`, matched against `venues.accessibility_attributes` |
| `group: 'solo' \| 'group'` | `trip_members` count |
| `days: ItineraryDay[]` | Derived from `trip_destinations` date sub-ranges |
| `seed: number` | Injected |

Output: `days[] → slots[]` where each slot is `{ dayPart, entity | null, reason }`. **Events win
their slot over venues** whenever a dated event falls in that day's window — a Pride march on the
Saturday is not a suggestion to be ranked, it is the day's fixed point, and the rest of the day is
built around it.

### 3.2 `itinerary_candidate_pool` RPC

One RPC, one fetch, cached — the `useLineStationPool` pattern. Returns venues + dated events for a
set of cities and a date window, carrying only the columns the generator scores on, plus:

- `day_part text[]` **derived from the current `category`**, plus `day_part_known boolean`. The
  stored `venues.day_part` column is not selected. §2's rule lives here and nowhere else.
- `accessibility_attributes` — so a11y filtering is a pool property, not a second round-trip.
- RLS-respecting (`SECURITY INVOKER`), so `safety_gated` venues drop out for anon exactly as they do
  everywhere else, and the signed-in flag belongs in the query key.

### 3.3 Replacing the static templates

`useTripTemplates.ts` holds `SEASONAL_POOL` — **11 hardcoded cities, hardcoded slugs, 13 hardcoded
CSS gradient literals**, with a comment recording that five of its slugs had already gone dead
(`mykonos`, `sao-paulo`, `phuket`, …) and silently produced un-clickable cards. It is the one true
static template artifact in the tree, and it is also the only place in the trip surface that carries
raw hex gradients, which the design system bans.

It is replaced by a derivation over the **same station pool the discover line already uses**
(`line_station_pool`, 346 rows, quality-gated on image + prose + safety notes + coordinates + ten
live venues) crossed with the season windows in `src/lib/lines/seasons.ts`. A template becomes
`{ station, seasonWindow, vibe }` — a parameter triple — and a template that cannot resolve is not
rendered, which is the behaviour the current file already has to hand-maintain a comment about.

### 3.4 Transport segments

`trip_places.arrive_mode` is `CHECK {walk,transit,drive}` and is **NULL on all 6 live rows**. The
mode vocabulary is widened to cover the brief's modes that we can represent honestly — `cycle`,
`rail`, `flight`, `ferry`, `rideshare` — and `tripLegs.ts` gains speeds and a per-mode outbound deep
link. What it does **not** gain is a routing engine; see §4.

---

## §4 — Two parts of the brief that change shape, with reasons

**1. Journey planning is out, and this is not my call to reverse.**
`docs/plans/2026-08-30-transit-mobility-phase-4-design.md` — merged to `main` yesterday — evaluates
exactly this and concludes: *"Journey planning does not belong on this platform at all."* The reason
is structural, not budgetary: a journey planner needs origin, destination and time-of-request, and
that triple **is** the sensitive query. `docs/architecture/open-data-integration.md` §4.3 forbids
proxying a user query to any external API and calls it "the strongest privacy guarantee here, and it
is structural rather than promised."

So "seamless multi-modal planning" is delivered as **modelling and honest estimates plus
user-initiated outbound links** — the traveller taps and leaves, which is the same pattern
`googleMapsDayUrl` already uses — and not as a routing proxy. `TRANSIT_KMH = 16` stays a stated
estimate rendered with `~`. If the routing half is wanted, that is a product decision that should
reopen the Phase 4 doc, not a thing to slip in under a refactor.

**2. Flights, car rental, cruises and ride-hailing are links, not inventory.** There is no supplier
integration in this repo and building one is a procurement project, not a refactor. They are
representable as `TransportSegment` rows with an operator and a booking URL, which is what makes
them show up in the itinerary, the budget and the booking inbox — all of which already exist.

---

## §5 — What shipped

| # | Change | File |
| --- | --- | --- |
| 1 | Candidate-pool RPC + `venue_category_day_part` (§2's rule, one object) | `supabase/migrations/20261117100000_itinerary_candidate_pool.sql` |
| 2 | The generator — pure, seeded, never pads | `src/lib/itinerary/generateItinerary.ts` |
| 3 | 23 unit tests, mutation-tested | `src/lib/itinerary/__tests__/generateItinerary.test.ts` |
| 4 | Pool hook, signed-in flag in the key | `src/hooks/useItineraryPool.ts` |
| 5 | "Build the days" panel — preview, reroll, explicit apply | `src/components/trips/ItineraryGenerator.tsx` |
| 6 | Mounted beside the LLM concierge | `src/pages/trips/TripPlannerPage.tsx` |
| 7 | `SEASONAL_POOL` deleted, seasonal tier derived from the station pool | `src/hooks/useTripTemplates.ts` |
| 8 | Vibe→count map extracted so picker and templates share one definition | `src/lib/lines/vibes.ts` |
| 9 | Dead `foursquare_rating` suggestion fetchers removed | `src/hooks/useTripSuggestions.ts` |
| 10 | Transport modes widened 3 → 8, per-mode estimates + honest deep links | `src/components/trips/tripLegs.ts`, `LegRow.tsx`, `20261117100100_…sql` |

### The mutation testing is worth reading

Six deliberate breakages were introduced into `generateItinerary` to check the tests bind. Five
failed as they should. **One survived — and so did the two tests that were supposed to cover it.**
Both had given the assumed-day-part candidate all four day parts, so the earlier slot consumed it
before the contested slot was reached: they were asserting the slot loop, not the score, and passed
with the ranking term deleted entirely. Rewritten to contest one slot with a filler for the other,
they now fail on three separate mutations of that term. The margin is also stated as one constant
rather than a bonus plus a matching penalty, because splitting it in two is what made the magnitude
ambiguous enough to hide behind.

Same pass caught a wrong test premise: "a short flight is never faster than walking" is false —
flying 30 km really is quicker than walking it. The claim worth binding is that a short flight costs
its **fixed overhead**, not its cruise time, which is what stops a naive km/h model reporting two
minutes and ranking flight above walking across town.

---

## §6b — One cross-component contract, pinned

`SLOT_TIME` (the nominal start time each generated stop is written with) is **not free to change**.
`detect_trip_gaps(p_trip_id)` — the "smart trip completion" RPC from the same 2026-05 foundation —
re-derives a day part from `trip_places.start_time` with its own thresholds, and it is the only
other place in the system that maps a clock time back to a slot:

```
< 11:00 morning · < 17:00 afternoon · < 21:00 evening · else night
```

Verified against the live function body: all four of our times land in their own band, with at
least 30 minutes of headroom on each side. **It has no caller in `src/` today, which is exactly why
this needed a test rather than a comment** — nothing would notice a disagreement until somebody
wires it up, and then every stop this generator wrote would be counted in the wrong slot, so the
feature would report an open evening it had already filled. Pinned by
`itineraryPlan.test.ts` → *"SLOT_TIME agrees with detect_trip_gaps"*, including a headroom
assertion, because a value moved to 10:59 still round-trips correctly while sitting one minute from
mis-slotting everything.

**A regex is not a reader check.** Searching the catalog for `day_part` returns `detect_trip_gaps`,
which looks alarming and is not: the match is its own `RETURNS TABLE` column name. It never reads
`venues.day_part`. §7's claim that the stored column has no reader was confirmed by reading the
function body, not by the grep that appeared to contradict it.

---

## §7 — Filed, deliberately not in this change

1. ~~**Repair `venues.day_part`.**~~ **DONE, and the filing above was WRONG** — the column is
   *dropped*, not repaired (migration `20261117120000`). Measuring it before writing the repair is
   what changed the answer. It holds only **five distinct values across 34,148 rows**, 27,817 of them
   `morning,afternoon`: not per-venue knowledge but a stamp, applied by `20260526000000`'s six
   category-keyed UPDATEs plus a catch-all that swept every remaining row into the majority value.
   The promised refiner ("pipeline-enrich-venue will refine") never ran. **77.5% now disagree** with
   `venue_category_day_part(category)`, and the disagreements are impossible rather than merely
   stale — 3,420 bars, 660 clubs and 1,291 saunas stamped `morning,afternoon`. The cause is measured,
   not assumed: **84.5%** of those bars and **77.9%** of those clubs carry an `enrichment_status`
   `category_backfill` marker (saunas 48.8%, weaker), so the stamp was derived from a category that
   `run_venue_category_reclassify` later moved underneath it.
   **Repairing it would have rebuilt the same bomb** — storing `venue_category_day_part(category)` in
   a column is a cached copy of a function that already answers on demand, correct on the night the
   cron runs and drifting again at the next reclassification, forever, for no reader. Nothing reads
   the column: one function mentions `day_part` (`itinerary_candidate_pool`, which derives it), no
   view, no index, no constraint, and `20260810075202` had already dropped `idx_venues_day_part_gin`
   as "a column nothing filters by". Pre-drop rows are preserved in `venue_day_part_drop_audit`.
   (The "15,833-row write" figure above was also wrong; the real count carrying a value is 34,148.)
2. **`venues.vibe_tags` is empty (0 of 25,178)** and `city_climate_monthly` is empty (0 rows). Both
   were created for this feature and never filled. The generator scores on `category` + `tags`
   (14,695 venues tagged) instead, and neither empty column is read — an empty array must not be
   mistaken for "this venue has no vibes".
3. **Journey planning / routing** — see §4. Reopening it means reopening the Phase 4 doc.
4. **Supplier inventory** for flights, rail, ferry, car hire — procurement, not a refactor.

---

## §6 — Re-run the measurements

```sql
select array_to_string(day_part,',') v, count(*) from venues group by 1 order by 2 desc;
select count(*) from venues where vibe_tags <> '{}';        -- 0
select count(*) from city_climate_monthly;                  -- 0
select count(*) from itinerary_draft_cache;                 -- 0
select count(*) from venues where category='other'
  and review_status is distinct from 'archived'
  and duplicate_of_id is null and closed_at is null;         -- 5409
-- day_part vs its own backfill rule (the 51% bar disagreement):
select category, count(*) filter (where day_part is distinct from array['evening','night'])
  from venues where category='bar' and closed_at is null
  and review_status is distinct from 'archived' and duplicate_of_id is null group by 1;
```
