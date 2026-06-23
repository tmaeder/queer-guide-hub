# Travel-buddy / "who's visiting at the same time" — Design (not yet built)

_2026-06-23 · status: design for review_

## Why

Roadmap M3+ item from `2026-06-23-trip-planning-integration-analysis.md`. Trips already encode
real intent (city + dates). Surfacing "other queer travelers in {city} while you're there" is
high-value for a community platform — but it exposes **location + dates + identity**, the most
sensitive data we hold. This doc proposes a **privacy-first, opt-in** design and is explicitly
gated on product sign-off before any code lands. Nothing here ships without that.

## Hard constraints (non-negotiable)

1. **Opt-in, default OFF.** Visibility is never on by default. A user appears to others only after
   an explicit per-trip toggle.
2. **City granularity only.** Never expose precise coordinates, the itinerary, hotel, or exact
   home location. Overlap is computed at `(city, date-range)` resolution.
3. **No outing.** Respect existing profile visibility (`privacy_settings`) and blocks. A user who
   is private/blocked never surfaces. Reuse the safety spine (block + report) shipped in #1784.
4. **Reversible + ephemeral.** Toggling off removes the user from results immediately; presence
   rows expire after the trip's end date. No durable "I was in X" history is exposed.
5. **High-risk destinations.** In criminalizing/death-penalty countries (`useTripSafety`), the
   opt-in is suppressed entirely (no surface, no toggle) — consistency with the outing-safety
   invariants already enforced for city safety notes.

## Reuse (don't rebuild)

- **Discovery + consent:** the intimate-match stack (`useIntimateMatches`, `intimate_likes`/
  `matches`, `IntimateMatchThread`) already models like→match→consent-gated chat with photo/location
  unlock timelines. A "travel buddy" intro is a new `conversation_type='travel'` thread reusing the
  same opening-moves + consent timeline.
- **Inbox:** `useInboxFeed` already has a `'trips'` filter; buddy intros land there as a new subtype.
- **Presence primitives:** `useTripLocalContext` / `PeopleHereRail` already compute "who's around"
  from active trips — extend, don't duplicate.
- **Safety:** `useTripSafety` (risk tier), `privacy_settings`, block/report from the safety spine.

## Proposed model

- `trip_presence_optin (trip_id, user_id, city_id, starts_on, ends_on, visible bool default false,
  created_at)` — one row per opted-in trip-city. RLS: owner writes own; reads go through an RPC,
  never direct table select.
- RPC `travelers_overlapping(p_city_id, p_start, p_end)` → returns **profile-card-safe** fields only
  (display_name, avatar, pronouns per visibility) for users who: opted in + visible, overlap the
  window, are not blocked either way, are profile-visible, and where the city's country isn't
  criminalizing. Never returns trip_id, dates beyond "overlaps", or location.
- Intro = insert into the existing match/conversation tables with `conversation_type='travel'`; first
  message gated by the same consent timeline as intimate matches.

## Surfaces

- A per-trip **"Find travelers here" toggle** (default off) in the planner, suppressed for high-risk
  countries, with a one-line "what others see" disclosure.
- A **"Travelers in {city} during your dates"** card (only when opted in) showing profile-safe cards
  with a "Say hi" action → travel thread.
- Intros appear under the inbox `'trips'` filter.

## Phasing

1. **M(next):** schema + `travelers_overlapping` RPC (read-only, no writes from UI) + the opt-in
   toggle + the travelers card. No messaging yet — just discovery behind opt-in.
2. **M(+1):** "Say hi" → `conversation_type='travel'` threads reusing intimate-match consent.
3. **M(+2):** inbox integration polish, mute/snooze, report flows.

## Open product questions (need answers before M-next)

- Should opt-in be **global** (a profile pref) or strictly **per-trip**? (Recommend per-trip — least
  surprising.)
- Do we allow opt-in for **past/ongoing** trips or **future** only?
- Minimum profile completeness to appear (avoid empty-shell accounts)?
- Rate-limit on "Say hi" to prevent harassment at city scale?

## Explicitly out of scope

Precise location sharing, live presence/last-seen, itinerary sharing, any auto-visibility. These are
incompatible with constraint #2 and the outing-safety invariant.
