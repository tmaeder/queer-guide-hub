# Playful trip journey map

## Intent

Make the individual trip workspace feel like the journey has already begun while preserving its operational clarity. The interface should reward planning progress with queer.guide-specific wayfinding rather than generic celebration.

## Delight thesis

Planning should feel like moving through a living queer travel map: each practical choice becomes a visible stop on the route, making progress motivating and the next action obvious.

## Visual direction

- Extend the existing paper, ink, photography, and subway-route visual system.
- Use queer.guide pink only for the active route, current stop, and small destination details.
- Add depth through photo layering, stamped labels, ticket-like metadata, subtle grain, and asymmetry.
- Keep type editorial and direct; personality comes from composition and specific travel language.
- Avoid generic gradients, decorative confetti, random floating shapes, or motion unrelated to a trip action.

## Journey progress

- Replace the equal grey at-a-glance cards with a connected route of five stops: transport, stay, events, queer places, and bookings.
- Each stop exposes a clear label, its real current state, and its existing destination link.
- Completed stops read as collected milestones; the first incomplete stop becomes the suggested next stop.
- The route remains understandable without color and linearizes cleanly on small screens.

## Hero treatment

- Preserve the destination photograph as the visual anchor.
- Add a compact destination stamp and ticket-style date metadata without obscuring the title.
- Make the progress ring feel integrated into the route language and label it as trip readiness.
- Retain the contextual primary action, traveller avatars, status, place count, and dates.

## Itinerary rhythm

- Give itinerary days stronger numbered stop markers connected by a continuous route line.
- Treat arrival and departure as journey endpoints.
- Keep drag-and-drop, maps, notes, add actions, and all existing tools unchanged.
- Improve empty-day guidance so a blank day feels ready to shape rather than unfinished.

## Motion and interaction

- Draw the route once on entry and stagger stop arrival subtly.
- Lift and slightly rotate interactive stops on hover while retaining a clear focus ring.
- Use a small, contained response for meaningful completion changes only.
- Respect `prefers-reduced-motion`; no looping decoration or delayed interaction.

## Responsive and accessible behavior

- Desktop uses an asymmetric connected route; mobile becomes a vertical journey timeline.
- All information remains available without hover, animation, or color.
- Preserve keyboard navigation, screen-reader labels, touch targets, localization, and current URLs.
- Do not introduce new dependencies, schema changes, or analytics events.

## Success criteria

- The page reads unmistakably as a queer.guide trip rather than a generic itinerary dashboard.
- The next useful planning action is clearer than before.
- Transport, accommodation, events, venues, and bookings remain equally functional.
- The design stays calm enough for repeated use and passes existing accessibility, trip, and production checks.
