# TREK → queer.guide trip planner parity map

Audit of every TREK feature (github.com/mauriceboe/TREK, v3.1.4) against the
queer.guide trip planner after the 2026-07-04 upgrade. TREK is AGPL v3 —
**zero code was copied**; features were clean-room reimplemented on the QG
stack (React 19 + shadcn/ui + Supabase + MapLibre).

Status legend: ✅ shipped (pre-existing or this upgrade) · ➕ shipped in this
upgrade · ✂️ deliberately cut (rationale given) · 🔁 covered differently.

## Trip planning & itinerary

| TREK feature | Status | QG implementation |
|---|---|---|
| Drag-and-drop day planner | ✅ | `DraggableItinerary` (dnd-kit), time slots |
| Day-by-day planning, day titles | ✅ | `trip_days` + DayCard |
| Day notes (timestamped, icon-tagged, reorderable) | ➕ | `trip_places` `category='note'` rows + `icon` column, curated lucide picker, sortable `DayNoteRow` |
| Interactive maps | ✅ | `TripMap` (MapLibre); per-day map peek |
| Place search | 🔁 | QG's own venue/event/hotel DB via `AddPlaceDialog` + engine-backed `TripSuggestions` — richer than external POI APIs for the queer use case |
| Place import (GPX / KML / GeoJSON / Takeout) | ➕ | `parsePlacesFile` + `ImportPlacesDialog`, matches rows to existing QG venues (300 m + name token) |
| Google Maps *live share-link* import | ✂️ | No API, ToS-fragile; Takeout covers the need |
| Route legs / transport modes | ➕ | `tripLegs` heuristics (haversine ×1.3, walk/transit/drive, per-place `arrive_mode` override), day walking total |
| Route optimization (auto-sort places) | ➕ | Nearest-neighbor `optimizeDayOrder` per day |
| Export route to Google Maps | ➕ | `googleMapsDayUrl` directions deep link per day |
| Weather (16-day + historical fallback) | ➕ | Open-Meteo client-side (`useDayWeather`), "typical" archive fallback for far dates, monochrome WMO icon map |
| Category filter on map pins | 🔁 | `/map` has full layer/category filtering; per-trip map stays minimal |

## Travel management

| TREK feature | Status | QG implementation |
|---|---|---|
| Reservations (status, confirmation №, files) | ✅ | `trip_reservations` + `ReservationsTab` |
| Booking email import | ✅ | Trip inbox (`trip-…@inbox.queer.guide` → Claude parsing → slotting) — stronger than TREK's KDE Itinerary extraction |
| Expense tracking + settle-up (Splitwise-style) | ✅ | `trip_budget_items`, splits, `CostSplitSummary` |
| Packing lists (categories, templates, progress) | ✅ | `PackingTab` + LGBTQ+-specific templates |
| Per-person packing (assignment, per-member view) | ➕ | Everyone/Mine scope toggle with per-scope progress |
| Weather-aware packing | ➕ | Forecast summary joins `packing-suggestions-llm` prompt + cache hash |
| Bag weight tracking | ✂️ | Niche; a note covers it (user-approved cut) |
| Document manager | ✅ | Encrypted `trip-documents` vault, expiry warnings |
| PDF export | ✅ | `generate-trip-pdf` + `/trips/:id/booklet` |

## Collaboration

| TREK feature | Status | QG implementation |
|---|---|---|
| Real-time sync + presence | ✅ | Supabase Realtime, `useTripPresence` |
| Roles (owner/editor/viewer) | ✅➕ | RLS pre-existing; viewer now enforced client-side (`canEditTrip` + readOnly cascade) |
| Invite links (expiry/uses) | ✅ | Member invites + permissioned share tokens |
| Group chat / shared notes / polls | ✅ | `TripChat`, `trip_notes`, `trip_polls` |
| Day check-ins (attendance) | ✂️ | Presence + chat + polls already cover group coordination |
| SSO / 2FA / passkeys | ✅ | Platform-level (Supabase Auth + passkey bridge) |

## Mobile, offline & addons

| TREK feature | Status | QG implementation |
|---|---|---|
| PWA / installable / offline snapshot | ✅ | Service worker + `offlineTripPack` (Today mode) |
| Offline *editing* (mutation queue) | ➕ | IndexedDB queue (`mutationQueue`) for packing checks + place updates, coalesced per row, LWW replay on reconnect, pending banner |
| Atlas (visited countries, bucket list) | ➕ | `AtlasMap` choropleth (existing R2 boundaries), country `place_marks` + `trip_visited_countries` view (completed trips) |
| Journey (travel journal, photos) | ➕ | `trip_journal_entries` + `trip-photos` bucket + `JournalTab` (mood, photos, member feed) |
| Vacay (leave calendar, public holidays, streaks) | ✂️ | Personal leave tracking is out of scope for a travel platform; trip dates + `trip-ical` export cover the calendar need |
| AirTrail flight sync | ✂️ | Self-hosted niche integration |
| MCP server / AI automation | 🔁 | Hosted AI concierge (`trip-concierge`, multi-turn, now weather/accessibility/opening-hours grounded) + `ai-plan-trip`; an MCP surface is a separate product decision |
| °C/°F unit toggle | ✂️ | Weather chips are °C; revisit if user demand appears |
| Admin panel / backups / notifications config | 🔁 | Platform-level equivalents (admin cockpit, Supabase backups, notification prefs) |

## QG-only strengths TREK has no equivalent for

Safety layer (equality scores, criminalization gating, per-leg safety, AI
safety briefings), LGBTQ+ venue/event database with suggestions, affiliate
booking links, trip discovery/fork/social, accessibility-needs matching,
trip nudges (news/weather/docs/bookings), email inbox parsing.
