# Events Timeline V2 — Design

**Status:** approved 2026-05-24
**Builds on:** `2026-05-24-events-timeline-view-design.md`
**Ships as:** 3 sequential PRs (A → B → C)

## Open-question resolutions

| Question | Decision |
|---|---|
| Phase order | 3 sequential PRs |
| Minimap | Always-on |
| Pan beyond fetched range | Auto-fetch (debounced 300ms) + thin loading bar at top of track |
| Smart presets | Replace current 6 with curated 8 |
| Command-K filter palette | Out of scope |

---

## Phase A — Timeline navigation (drag-pan + zoom + minimap)

### Viewport state
Decouple **viewport** `[viewStartMs, viewEndMs]` from **fetched data range**. Initial viewport = `fitToData(events)`.

### Interactions
- **Drag-pan** inside track → translate viewport. Threshold 5px to disambiguate from clicks.
- **Wheel (cmd/ctrl) / pinch** → zoom about cursor anchor. Min span 1d, max span 5y.
- **Toolbar** (above period chips): `« unit` / `Today` / `unit »` · `Go to date ▾` · `Fit to data` · `− 🔍 +`.

### Minimap
Always-on, ~60px tall, full track width. 5-year span centered on today. Monthly density bars from fetched events. Draggable viewport rectangle with edge handles for zoom.

### Fetch wiring
`useEvents` already supports `dateRange`. Page-level wires viewport bounds → `dateRange` filter, debounced 300ms. Skeleton: thin progress bar at top of track during inflight.

### Files (Phase A)
- `src/components/events/EventsTimelineView.tsx` (major refactor)
- `src/components/events/TimelineToolbar.tsx` (new)
- `src/components/events/TimelineMinimap.tsx` (new)
- `src/utils/timelineViewport.ts` (new — `panBy`, `zoomBy`, `centerOn`, `fitToData`, `clamp`)
- `src/pages/Events.tsx` (viewport plumbing)

---

## Phase B — Filters & sorting + URL state + presets v2

### Multi-select type + city
Replace single-Combobox / single-Select with a new reusable `MultiCombobox`. `useEvents` extended to accept `cities?: string[]` and `eventTypes?: string[]` (single-value backwards compat by accepting `string | string[]`).

### New filter dimensions

| Filter | UI | Column |
|---|---|---|
| Accessibility | Chip toggle group | `accessibility_attributes[]` |
| Target groups | Chip toggle group | (verify schema) |
| Language | MultiCombobox | `content_language` |
| Age restriction | Select (18+/21+/all-ages) | `age_restriction` |
| Organizer / group | Combobox typeahead | `group_id` |

### Sort dropdown
Add **Closest to me** (gated on geo), **Most popular** (going+interested), **Recently added** (`created_at desc`).

### URL state — full sync
All filter state ↔ query params via new `src/utils/eventsQueryString.ts`. Backwards compat: existing `city` + `q` continue to parse. **Share button** copies URL to clipboard.

Schema:
```
?cities=Berlin,Hamburg&types=party,meetup&tags=lgbtq:trans
 &acc=wheelchair&lang=en,de&age=18&from=2026-06-01&to=2026-09-01
 &sort=popularity&free=1&featured=1&near=1&past=1&q=drag&view=timeline
```

### Smart presets v2 (replace current 6 → 8)
Tonight · This weekend · Next 7 days · Pride season · Free · Featured · Near me · New this week
(Drop "This month" — covered by Next 7 days + date range picker.)

### Filter pills
One pill per multi-select value (`City: Berlin ✕`, `City: Hamburg ✕`, …). "Filters (4)" badge on the Filters button.

### Files (Phase B)
- `src/components/events/PresetChips.tsx` (updated list + `getPresetDateRange`)
- `src/components/events/MultiCombobox.tsx` (new)
- `src/components/events/FilterPills.tsx` (new — extracts the existing inline pill block)
- `src/components/events/ShareFiltersButton.tsx` (new)
- `src/utils/eventsQueryString.ts` (new)
- `src/pages/Events.tsx` (multi-state, new dimensions)
- `src/hooks/useEvents.tsx` (array filters, new sort values)
- i18n locales (×11) — ~25 new keys

---

## Phase C — Hover card v2

Swap `Tooltip` → `HoverCard` (radix) for interactive content (RSVP, Save).

### Layout (~320px wide)
```
┌───────────────────────────────────────────┐
│ [64×64 img] Title                    ⭐   │
│             📅 in 12 days                  │
│             Jun 1 – Jun 8 · Berlin        │
│  Two or three lines of description…       │
│  [party]  [Free]                           │
│  ───────────────────────────────────────  │
│  [👤 Going] [⭐ Interested] [➕ Trip]      │
└───────────────────────────────────────────┘
```

### Time-until badge
Reuse `relativeDateLabel` from `src/utils/relativeDateLabel.ts`.
- Past: "ended 3 days ago" (muted)
- Soon: "in 12 days", "tonight at 22:00", "tomorrow"
- Far future: "in 4 months"

### Quick actions
- **RSVP** — `useEvents().updateAttendance`. Signed-out users → sign-in toast/redirect.
- **Save to trip** — `useActiveTrip().addToTrip / removeFromTrip` (reuses EventCard pattern).
Both filled when active.

### Image
First non-null `images[0]`, lazy-loaded, 64×64 cover, `rounded-element`. Omit layout block when no image.

### Trigger
- Hover + keyboard focus open the card.
- Card persists while pointer hovers it (HoverCard native).

### Files (Phase C)
- `src/components/events/EventHoverCard.tsx` (new)
- `src/components/events/EventsTimelineView.tsx` (use EventHoverCard for single events; clusters keep Popover list)
- `src/utils/relativeDateLabel.ts` (already exists; verify locale-aware)
- i18n locales (×11) — ~6 new keys ("in {{n}} days", action labels)

---

## Out of scope (deferred)
- Drag inertia
- Mini-map zoom via drag handles in Phase A — keep simple drag-pan-only in v2.0, edge-resize in v2.1
- Command-K filter palette
- Attendance counter + distance in hover card (user did not select these)
