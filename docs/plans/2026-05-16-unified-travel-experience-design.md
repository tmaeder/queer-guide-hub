# Unified Travel Experience — Design

**Date:** 2026-05-16
**Status:** Approved design, ready for phased planning
**Scope:** Redesign `/hotels`, `/travel`, `/trips`, `/profile/footprint`, and trip planner detail pages as a single trip-centric experience.

## North star

**Trip-centric.** Every travel surface lives inside a trip lifecycle: **dream → plan → book → live → remember.** Hotels, inspiration, and footprint become modes/layers of the same Trip object. The user feels one orchestrated journey, not four separate tools.

## Decisions log (brainstorming Q&A)

1. **Direction:** Trip-centric IA (option A).
2. **Zero-trip entry:** Dual mode toggle — Browse vs Plan (option C).
3. **`/hotels`:** Stays as transactional shortcut (option C).
4. **Footprint role:** Auto-generated + ambient + gamified (A+B+C).
5. **Trip detail pages:** Timeline-as-spine, one continuous artifact (option B).
6. **Booking integration:** All three layers — pre-slot, manual confirm, inbox parser (A+B+C).

---

## Section 1 — Information Architecture

**Routes (final):**
- `/travel` — landing. Dual-mode toggle: **Browse** | **Plan**. Default = Browse if no active trip; Plan if active/upcoming trip exists. Persists in localStorage + `?mode=` URL.
- `/hotels` — kept as transactional shortcut. SEO landing. Bookable without trip context. "Add to trip" optional CTA.
- `/trips` — list of all trips (current, upcoming, past, saved/discovered).
- `/trips/discover` — public trips, templates.
- `/trips/:id` — **unified trip workspace** (timeline spine). View-modes via `?view=plan|today|booklet|share`. Old `/plan`, `/today`, `/booklet`, `/shared` routes redirect.
- `/profile/footprint` — global aggregated map across all trips.

**Killed / merged:**
- `/travel` inspiration content folds into Browse mode.
- 4 trip sub-pages collapse to one route with view-mode lenses.
- `BookNowAccordion` on `/travel` → replaced by Plan-mode CTA.

---

## Section 2 — Dual-Mode Landing (`/travel`)

Sticky mode switch at top (pills), persisted in localStorage + URL.

### Browse mode (default for new / no-trip users)
- **Hero:** rotating destination spotlight (city + safety badge + image). Search bar: "Where to?" → places, hotels, events, villages.
- **Filter rail:** type (cities · hotels · events · villages · personalities), region, vibe, safety tier, pride-month.
- **Grid:** mixed inventory, infinite scroll.
- **Footprint overlay:** visited pins shown faintly on every map/card.
- **Per-card actions:** Save · Book (if hotel) · Add to trip (opens trip picker / "+ new trip").

### Plan mode (default if active/upcoming trip exists)
- **Active trip strip:** name, dates, destination, day-counter ("Day 2 of 7" or "in 14 days"). Click → `/trips/:id`.
- **Multi-trip:** segmented control to switch active trip.
- **Inventory grid:** pre-filtered by active trip's destination + dates. Save/Book/Add silently target that trip.
- **Sidebar:** trip's current timeline gaps ("Day 3 has no accommodation", "no dinner Day 5"). Click gap → filtered grid for that slot.

### Mode switching
- Browse → Plan with no trip: prompts "Start a trip" (1-tap dialog, seeded with last browsed destination).
- Plan → Browse: shows inventory without trip context, but saves still flow to active trip.

---

## Section 3 — Trip Workspace (`/trips/:id`, timeline spine)

Single vertical scroll. Top = pre-trip. Middle = day 1 → day N. Bottom = post-trip memory. No tabs.

### Spine anatomy
1. **Header (sticky):** trip name · dates · destination · cover · view-mode switcher (Plan · Today · Booklet · Share) · settings.
2. **Pre-trip block:**
   - Countdown.
   - Checklist: flights · accommodation · visa · packing · safety brief.
   - Gaps surfaced from timeline.
   - Booking inbox (forwarded confirmations — Section 4).
3. **Day cards (one per day):**
   - Date · weather (≤14d) · auto-titled theme.
   - Time-ordered slots: morning · afternoon · evening · night.
   - Each slot = empty placeholder OR booked item (hotel, venue, event, reservation, transit).
   - Drag to reorder. Long-press to move across days.
   - Inline "+" → opens Browse-mode filtered to that day's destination + time-of-day.
   - Map peek per day (collapsible).
4. **Post-trip block (auto-fills past end-date):**
   - "How was it?" prompt → mark visited, rate, photo upload, journal.
   - Auto-generates Footprint entries.
   - Booklet snapshot frozen for archive.

### Today behavior
- When `now` ∈ trip dates: auto-scroll to today on load.
- Today's card expands; past collapsed; future dimmer.
- "Right now" badge on current time-slot.
- Offline cache for today's day-card (PWA).

### View-mode lenses (same data, different chrome)
- **Plan** — full edit, sidebar with gaps + suggestions, per-day map.
- **Today** — single-day focus, big type, offline, walking directions, no edit chrome.
- **Booklet** — print/PDF-ready, every day on one page, exportable.
- **Share** — public read-only URL, sensitive fields hidden, collaborator invites with edit rights.

Switching modes preserves scroll position; chrome swaps.

---

## Section 4 — Booking Integration

Three layers, all feed the timeline.

### Layer A — Pre-slot on intent
- "Add to trip" creates tentative slot, status = `intent`.
- Dashed border + "not booked" badge.
- Surfaced in pre-trip checklist + gap detector.
- "Book now" → affiliate redirect; on return, auto-flip to `booked` if detectable (referrer + timestamp + price), else prompt manual confirm.

### Layer B — Manual one-click confirm
- "Booked it" button on any tentative slot, hotel card, venue.
- Mini-form: dates · conf # (optional) · price (optional) · notes.
- Status → `booked`. Solid border. Conf # stored.

### Layer C — Inbox parser (auto-slot)
- Per-trip forwarding address: `trip-<shortid>@inbox.queer.guide` (CF Email Worker → parse → write).
- User forwards Booking.com, Airbnb, Expedia, airlines, trains, OpenTable. Also paste box for confirmation text.
- Parser (LLM + per-sender structured extractors) extracts: vendor, type, dates, times, location, price, conf #.
- Lands in **booking inbox** at top of pre-trip block. Auto-slot if confidence ≥ threshold; else tap "Slot it".
- Seeded types: lodging, flight, rail, restaurant. Unknown → manual slot.

### Conflict + gap detection (all layers)
- Two bookings same slot → red warning.
- No lodging when prior day had one → "did you check out?" prompt.
- Flight arrival 22:00 + dinner 19:00 same day → impossible-trip warning.

### Data model addition
`trip_items` table: `trip_id, day_index, slot, status (intent|booked|completed), entity_ref (venue/event/hotel/external), confirmation_no, price, source (manual|affiliate|inbox|paste)`.

### Privacy
- Forwarding inbox opt-in per trip, single-use, deletable.
- Parsed emails stored encrypted, auto-purged 30 days post-trip.

---

## Section 5 — Footprint (Ambient + Accreting + Gamified)

### A — Ambient layer (everywhere)
- Visited/saved/contributed pins on **every map** (browse grid, day cards, place detail, trip workspace).
- 10% opacity default; toggle in map controls.
- Hover on place card anywhere: "You visited Sep 2024" badge if applicable.
- Browse sort options: "Hide places I've visited" / "Only places I've visited".

### B — Accreting from trips
- Post-trip block on `/trips/:id` prompts "mark visited" per slotted item. One-tap confirm-all.
- Auto-fill: any `booked` slot with end-date in past → `visited` default.
- Footprint entries link back to source trip (`from trip: Lisbon Pride 2026`).
- Photo + journal per place.

### C — Gamified (`/profile/footprint`)
- **Global map:** all pins, filterable by kind/year/trip/type.
- **Stats:** countries (out of N), cities, venues, events, queer villages, continents, Pride events, year heatmap.
- **City completion %** — for cities with ≥3 visits: "you've seen 12/40 LGBTQ+ venues here" → "Plan return trip" CTA.
- **Badges (monochrome, subtle):** First trip · 10 cities · Pride veteran · Continental traveler · Village explorer.
- **Year-in-review:** annual shareable card (December).
- **Return-trip nudge:** "You loved Lisbon. 8 new venues added since." → seeds new trip.
- **Share:** public Footprint URL (opt-in per kind).

### Data model
- Extend `place_marks`: `trip_id` (nullable), `photo_urls`, `journal_note`, `rating`.
- Materialized view `footprint_stats_v` for dashboard speed.

---

## Section 6 — Cross-Cutting Decisions

### Navigation
- Top nav: **Travel** replaces today's Travel + Hotels + Trips entries.
- Sub-nav within Travel: Browse · Plan · My Trips · Discover · Footprint.
- `/hotels` stays in footer + SEO + direct-link only.

### State & sync
- Single `useActiveTrip()` hook everywhere.
- Optimistic mutations for add-to-trip, status flips, slot moves.
- Supabase Realtime channel per trip for collaborator live edits.

### Mobile
- Mode switch becomes bottom-sheet.
- Trip workspace = full-screen scroll. Day cards swipe horizontally as alt-view.
- Today mode = mobile-first PWA, offline cache.

### SEO
- `/hotels`, `/travel` public-indexable Browse inventory (no login).
- `/trips/:id` indexable only when `share` mode + public toggle on.
- `/profile/footprint` `noindex` (already is).

### Analytics events
`travel_mode_switched`, `trip_started_from_browse`, `slot_added`, `booking_intent`, `booking_confirmed_manual`, `booking_inbox_parsed`, `footprint_marked_visited`, `return_trip_nudge_clicked`.

### Rollout phases
1. **Foundation:** unify `/trips/:id` routes into one workspace with view-modes (cosmetic, low risk).
2. **Browse/Plan mode switch:** new `/travel` landing, keep `/hotels` shortcut.
3. **Timeline spine:** day cards + drag/drop + gap detector.
4. **Booking layers A + B:** intent + manual confirm.
5. **Footprint ambient + accreting:** pins everywhere, post-trip prompt, auto-fill.
6. **Footprint gamified:** stats, badges, completion %, year-in-review.
7. **Booking layer C:** inbox parser (CF Email Worker + LLM).

### Out of scope (YAGNI)
- In-app booking checkout (stays affiliate redirect).
- Multi-currency price normalization beyond marketplace.
- Trip cost budgeting/splitting.
- Social feed of friends' trips.

---

## Next step

Hand off to `/gsd-new-milestone` or `/gsd-plan-phase` per rollout phase. Start with Phase 1 (route unification) as lowest risk.
