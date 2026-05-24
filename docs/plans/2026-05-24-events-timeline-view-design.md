# Events Timeline View — Design

**Status:** approved 2026-05-24
**Replaces:** `EventsCalendarView` on `/events`
**Inspired by:** `PrideTimeline` on `/pride`

## Goal

Replace the month-grid Calendar view on `/events` with a horizontal timeline modeled on `PrideTimeline`, adapted to events' open-ended date model and higher density.

## Decisions (locked)

1. **Time scope:** dynamic — track spans min→max of filtered events.
2. **Density:** cluster + hover-expand for ≥3 events tightly co-located.
3. **No stats cards** (drop Total / Free / Categories from the old calendar layout).
4. **Multi-day events:** horizontal bar spanning `start→end`.
5. **Click:** navigate to `/events/:slug` (slug column exists).
6. **Mobile:** horizontal scroll (Pride parity).
7. **Past events:** existing `showPast` toggle still drives the fetch; on the timeline, render past events at reduced opacity when included.
8. **Shared row-placement util:** extract to `src/utils/timelineLayout.ts`; refactor `PrideTimeline` in the same PR.

## Adaptive column unit

| Total range | Column unit |
|---|---|
| ≤ 14 days | day |
| ≤ 90 days | week |
| ≤ 2 years | month (common case) |
| > 2 years | quarter |

`TRACK_WIDTH = max(viewport, computedFromColumns)`. Sticky period chips at top with per-column count; click → scrollIntoView.

## Components & files

| File | Action |
|---|---|
| `src/components/events/EventsTimelineView.tsx` | NEW |
| `src/utils/timelineLayout.ts` | NEW — shared `placeEvents` + helpers |
| `src/components/pride/PrideTimeline.tsx` | refactor to use shared util |
| `src/components/events/EventsCalendarView.tsx` | DELETE |
| `src/components/events/__tests__/EventsCalendarView.test.tsx` | DELETE (rewrite as timeline test) |
| `src/components/events/__tests__/EventsTimelineView.test.tsx` | NEW |
| `src/pages/Events.tsx` | rename `viewMode` literal `'calendar'` → `'timeline'`, swap icon + label |
| `src/i18n/locales/*/translation.json` | rename key `calendarView` → `timelineView` (11 langs) |

## Rendering rules

- **Single-day event** → dot + label (Pride parity)
- **Multi-day event** → bar with rounded ends, label inside if wide else floated above
- **Featured** → filled / solid; non-featured → outline
- **Past** (when `showPast` true) → 50% opacity
- **Today marker** vertical line + pill if today ∈ range
- **Cluster** of ≥3 events whose start dates fall within ~24px in the same candidate row → single `N` chip
  - Hover/focus → Popover with vertical mini-list; each row is a `<Link>`

## Hover preview card (single events)

Reuse `Tooltip` from `PrideTimeline`. Contents:

- Title (+ ⭐ if featured)
- `formatEventTime(start_date, end_date, timezone)` with calendar icon
- `venue_name`, `city` with map-pin icon
- `event_type` badge, "Free" badge if applicable
- "Date estimated" footnote when source confidence low (skip if events table doesn't track)

## Row placement

Extracted util signature:

```ts
export interface Placeable {
  id: string;
  startMs: number;
  endMs: number; // = startMs for single-day
}
export interface Placed<T> {
  item: T;
  row: number;
  startMs: number;
  endMs: number;
}
export function placeOnRows<T extends Placeable>(
  items: T[],
  pxFor: (ms: number) => number,
  minLabelPx: number,
): Placed<T>[];
```

Greedy by start time; each row tracks `lastEndPx + minLabelPx`; bars use real end, dots use `start + minLabelPx`.

## Open items resolved

- **slug vs id route:** events table has `slug: string` (non-null). Use slug directly.
- **shared util:** yes, extract + refactor PrideTimeline.
- **past behavior:** opacity-50 when `showPast` true; otherwise filtered upstream.

## Out of scope

- Drag-to-zoom on the track
- Per-day RSVP UI (the old calendar's "Attend" popover) — RSVP stays in grid view
- Multi-event aggregation across map / timeline sync
