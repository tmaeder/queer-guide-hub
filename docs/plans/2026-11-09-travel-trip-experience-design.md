# Travel and Individual Trip Experience Design

## Goal

Make every core Travel and Trips surface feel like one inspiring product rather than a collection of unrelated pages. The experience should lead with destination imagery and useful suggestions while keeping planning, booking, safety, collaboration, and day-of-travel tools easy to reach.

## Approved page order

All core pages use the same vertical rhythm:

1. Compact page identity or photographic hero
2. Sticky Travel navigation
3. Page content

This order applies to Travel inspiration, booking, route building, trip lists, and an individual trip. Public shared trips and print-oriented booklets inherit the visual language without exposing the complete signed-in navigation.

## Shared Travel navigation

Use one shared navigation component with the same labels and order everywhere:

- Inspire
- Build a trip
- My trips
- Book

The active destination must be visually explicit and exposed through `aria-current`. The navigation scrolls horizontally on narrow screens and remains sticky below the global header without obscuring page content.

## Visual direction

Use an editorial travel-journal direction rather than a technical dashboard:

- Destination photography or a high-quality destination fallback anchors every major page.
- Warm paper and surface tones support the existing monochrome brand system.
- Large editorial type is reserved for the trip or destination name.
- Operational controls use calmer typography, compact iconography, and consistent rounded containers.
- Empty states show useful visual suggestions instead of blank forms.
- Motion is subtle and functional; the experience must remain usable with reduced motion enabled.

## Individual trip workspace

### Hero

The trip workspace begins with a wide destination image containing:

- Trip title and destination
- Dates and duration
- Status and readiness
- Travellers
- A single contextual next-best action

Secondary actions such as share, offline access, and booklet export remain available but are visually quieter and must work on small screens without crowding the title.

### At-a-glance summary

Below the trip navigation, show a concise summary for:

- Arrival and onward transport
- Accommodation
- Events
- Queer venues and saved places
- Budget or booking readiness

Each summary item links to or focuses the relevant planning section. Missing information becomes an inviting suggestion such as “Choose a stay” or “Add how you’re getting there,” not an error state.

### Day-by-day story

The plan is presented as a journey timeline. Days may contain:

- Flights, rail, coaches, ferries, driving, car hire, and transfers
- Public transit, taxi, cycling, and walking legs
- Hotels, boutique hotels, B&Bs, apartments, hostels, and other stays
- Events with date and time awareness
- Queer venues, restaurants, sights, and custom places

Transport and accommodation are first-class itinerary objects. Events and venues must retain their distinct metadata and actions rather than being flattened into generic places.

The timeline and map stay connected: selecting an itinerary item focuses its map marker, and selecting a marker reveals the matching itinerary item.

### Workspace navigation

Plan, Prepare, Together, Today, and Booklet use one coherent secondary navigation pattern. Contextual sub-sections may appear within Plan, but there must not be two competing navigation bars with different visual conventions.

### Safety and preparation

Safety and criminalisation gates remain authoritative and must never be bypassed. Important destination warnings stay visible across relevant sections. Detailed documents, packing, reservations, and local-context preparation belong under Prepare.

## Child pages

### Inspire

Retain personalised, image-led packages and real venue/event evidence. The shared navigation appears immediately after the compact identity section.

### Build a trip

Keep the route builder interactive, but bring it into the shared shell. Its generated cities should feel like an inspiring route story rather than a technical line-generator tool.

### My trips

The Plans module remains the source of owned trips. Travel navigation should link there consistently and trip cards should use the same image, metadata, and readiness language as the workspace.

### Book

Booking retains flights, stays, transfers, car hire, and activities. It receives the shared identity and navigation treatment, with current-trip context when available.

## Responsive and accessibility requirements

- Preserve heading hierarchy, landmarks, keyboard navigation, visible focus, and screen-reader labels.
- Keep touch targets at least 44 pixels high.
- Allow sticky navigation to scroll without hiding its active item.
- Collapse dense hero actions into an accessible overflow treatment on small screens.
- Do not encode readiness, safety, booking state, or active navigation by colour alone.
- Images require meaningful alt text when informative and empty alt text when decorative.
- Maintain reduced-motion behavior and prevent map interactions from trapping keyboard focus.

## Data and behavior constraints

- Reuse existing trip, reservation, event, venue, hotel, and transport data sources.
- Do not fabricate live availability, prices, bookings, events, or analytics.
- Preserve deep links and query-based workspace state.
- Preserve branch protection, safety gates, authentication gates, and rollout flags.
- Avoid introducing a new competing trip state model.

## Verification

- Component tests for shared navigation, active states, responsive overflow, and contextual actions.
- Workspace tests covering transport, accommodation, events, venues, empty states, and section switching.
- Route-level tests for Travel, Book, Route Builder, Plans links, and individual trip deep links.
- Accessibility checks for landmarks, headings, focus order, keyboard operation, and colour-independent state.
- Visual review at desktop, tablet, and mobile widths.
- Production build and focused lint/type checks, with unrelated pre-existing failures reported separately.
