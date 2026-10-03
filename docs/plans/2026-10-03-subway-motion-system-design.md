# Subway motion-system completion

## Context and decision

The supplied Queer Guide subway-map files define a recognisable motion language, but the production app currently implements only part of it. Route journeys and track loaders exist, while the shared `ScrollReveal` and `StaggerGrid` APIs are static passthroughs and many interactive surfaces only change colour. The result preserves the visual style but misses the system's sense of movement and feedback.

The user has repeatedly asked for strict implementation of the supplied design system, including animations, and has explicitly delegated design decisions and approved autonomous completion. This document records the implementation decision before code changes.

## Approaches considered

1. **Page-by-page animation pass.** Add bespoke effects to every route. This can match individual mockups closely, but duplicates logic, drifts quickly, and is difficult to keep accessible.
2. **Global CSS blanket.** Animate broad selectors such as every link, card, and section. This gives fast coverage but creates unwanted movement, makes exceptions fragile, and cannot explain route or list relationships.
3. **Layered motion system (selected).** Restore the existing reusable motion primitives, encode the supplied hover/press grammar in shared components and tokens, then add authored movement only where it communicates route, state, or list continuity. This delivers broad coverage while remaining testable and controllable.

## Motion thesis

### Focal moment

Navigation remains the authored subway moment: the route line draws, the rider travels, and the destination station arrives. The sequence should feel like moving between stops, not like a generic page fade.

### Continuity

- Content groups reveal as groups with a short, capped stagger.
- Page sections use a small directional entrance only once, when they become relevant.
- Filters, tabs, accordions, dialogs, and menus visibly connect the control action to the resulting state.
- Loading uses the branded travelling track loop and layout-matched skeletons.

### Feedback

- Cards use the source system's diagonal `(-3px, -3px)` lift and soft shadow.
- Station-like circles and identity markers rise or scale on hover/focus.
- Chips and compact actions invert or fill, with a small press response.
- Images and directional icons move only inside the activated surface.
- Keyboard focus receives the same state clarity without relying on pointer hover.

### Timing and easing

- Immediate feedback: 140–200 ms.
- Routine state changes: 200–300 ms.
- Route/layout continuity: 300–500 ms.
- Authored route journey: existing 620 ms sequence.
- Primary arrival easing: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Overshoot is reserved for station arrival/pop, matching the supplied loading specification.
- Exit motion is shorter than entrance motion.

## Scope

1. Restore `ScrollReveal` and `StaggerGrid` as resilient, reduced-motion-aware components without hiding content when JavaScript or observation fails.
2. Consolidate shared CSS utilities for card lift, station pop, chip inversion, image zoom, and active press feedback.
3. Apply those primitives through shared cards, buttons, navigation, discovery, news, marketplace, travel, and content-detail components so downstream pages inherit the system.
4. Refine route journey, track loader, dialogs/sheets, filters, and loading transitions where current feedback is incomplete.
5. Keep `/help`, `/safety`, and `/report-*` free of decorative entrances. Functional feedback remains available.

## Accessibility and performance

- `prefers-reduced-motion: reduce` removes spatial travel, stagger delay, continuous decorative motion, and image zoom while retaining colour/focus/state feedback.
- Content is visible in the default server/no-script state. Entrances are progressively enhanced after hydration.
- Animate transform and opacity for recurring interactions; do not animate layout-driving properties.
- Stagger is capped so large result sets do not produce long waits.
- Continuous motion pauses when hidden or offscreen where applicable.

## Verification

- Unit tests for the restored primitives and reduced-motion branches.
- Typecheck, lint on changed files, focused tests, and production build.
- Desktop and mobile visual/interaction checks across home, discovery, events, venues, news, marketplace, travel, and representative detail pages.
- Production E2E checks for route journey, hover/press feedback, list entrance, keyboard focus, reduced motion, and motion-free safety routes.

