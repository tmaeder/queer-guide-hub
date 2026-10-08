# People Hub Map Design

## Goal

Make `/people` a practical hub for connecting with other people for community building, dating, nearby discovery, and travelling together. The page should provide a geographic starting point without exposing private member locations.

## Decision

Embed the existing interactive map directly below the People navigation and introductory hero, before the editorial content rails.

The map will show public, place-based connection opportunities:

- queer venues and community spaces;
- events;
- queer villages and neighbourhoods.

Individual member locations will not appear on this general-purpose map. Approximate member presence remains opt-in and belongs to the dedicated Nearby experience. Dating retains its existing consent and authentication gates.

## Interaction

- Use the existing `MapShell` so map controls, clustering, accessibility, and responsive behaviour stay consistent with the rest of Queer Guide.
- Use an embedded height of approximately 480px on larger screens with a shorter mobile height.
- Enable cooperative gestures so page scrolling remains predictable.
- Start with venues, events, and neighbourhoods enabled.
- Keep map URL state local to the hub; the `/people` query string remains available for intent and city context.
- Provide a clear heading and short explanation tying the map to the hub's purpose: find where people gather, then choose Community, Dating, Travel, or Nearby from the shared People navigation.

## Privacy and safety

The map uses only public entity data. It does not plot user profiles, dating activity, precise presence, or private group membership. Member-location discovery continues through `/people/nearby`, where existing opt-in rules apply.

## Verification

- Component test proves `/people` renders the embedded map section.
- Production E2E contract checks that the map is present alongside all People destinations.
- Desktop and 390px mobile checks verify the map does not introduce horizontal overflow.
- Typecheck, focused lint, focused tests, routing validation, and production build must pass.
