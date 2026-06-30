# Single Event Page Rebuild — Design

**Date:** 2026-06-23
**Route:** `/events/:slug`
**Goal:** Rebuild from scratch — more useful, informative, playful, personalized, polished. Remove redundancy.

## Decisions (locked)

- **Layout:** Full custom bespoke layout. Drop `EntityDetailLayout` + the single useless "Overview" tab. Merge the 3 discovery rails into one.
- **Playful:** Within the monochrome design system only — no new color, no confetti. Functional motion, reduced-motion safe.
- **Personalization:** Auth-aware using existing signals. No ML.

## Problems with the current page

- Generic `EntityDetailLayout` shell with a single-tab wrapper (pointless).
- Cramped ~8-button action row in the hero (Tickets, Save, Add-to-trip×2, Calendar, Share, Send, Visited, Report, AdminEdit).
- Date/time/price/location **duplicated** between the hero fact-bar and the sidebar "When & where" card.
- **Three overlapping discovery rails** dumping ~22 cards: `TrendingStrip` (city) + `SimilarItems` (pgvector) + `MoreLikeThisByTag` (tags).
- No countdown / liveness affordance, no personalization context line.

## New structure

Content column + **sticky decision card** (RA / Dice / Eventbrite pattern). Mobile: single column + sticky bottom action bar.

1. **Hero** — cover (logo, status pill, Featured), eyebrow row (type · festival · equality badge), title, location line. **NEW** live-state line: upcoming → ticking countdown (`Starts in 3 days · Fri 14:00`, reduced-motion → static); live → `Happening now` + pulse dot; past → quiet `Ended`.
2. **Sticky decision card** (right rail desktop / sticky bottom bar mobile) — consolidates all actions: price (single source of truth), primary CTA (`Get Tickets` else `Add to Trip`), inline RSVP Going/Interested (auth, check-fill micro-interaction), Save, condensed When & Where + Directions + Add-to-calendar, overflow `⋯` (Share, Send, Mark visited, Report).
3. **At-a-glance fact strip** — When (tz toggle), Where (tap→map), Price, Ages. One place only.
4. **Personalized "for you" line** (auth, no ML) — renders only what's true: `In N of your trips`, `✓ Matches your needs: step-free` (intersect `travel_preferences.accessibility_needs` ∩ `accessibility_attributes`), `N people you may know are going`. Honest absence otherwise.
5. **About** — description + recurrence/festival badges + accessibility block.
6. **Who's going** — merge attendee counts + `PeopleHereRail`. Avatar stack, `12 going · 4 interested`, empty state `No RSVPs yet. Be first.`
7. **When & where** — map + venue + directions/call/website + organizer card.
8. **Safety** — criminalization banner + `DestinationSafetyCard`, prominent for high-risk.
9. **More events — ONE merged rail** — blend same-city-trending + semantic-similar + shared-tag, dedupe, cap ~8–10, each card tagged with a reason chip (`Same city` / `Similar vibe` / `Shared tags`).

## Removed / fixed

- 3 rails → 1 merged, deduped.
- Tabs wrapper → plain sections.
- date/time/price/location duplication → decision card + one fact strip.
- 8-button action row → primary card + `⋯` overflow.

## Implementation notes

- Reuse existing pieces: `FavoriteButton`, `PeopleHereRail`, `AddToTripDialog`, `SendEventDialog`, `DestinationSafetyCard`, `SafetyAlertBanner`, `EqualityScoreBadge`, `EntityMap`, `AmenityDisplay`, `ShareMenu`, `EVENT_SELECT_FIELDS`/`fetchEvent`, attendance handlers.
- Merged rail: client-side blend of the 3 existing discovery sources + dedupe (no new RPC for v1).
- All motion gated on `prefers-reduced-motion`. No `--accent-brand` spray; keep monochrome.
- Keep safety gating, JSON-LD, breadcrumbs, meta.
