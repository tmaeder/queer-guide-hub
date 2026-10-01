# Rights sources subway redesign

## Goal

Redesign `/rights/sources` so it feels native to the Queer Guide subway-map identity while keeping a dense legal-methodology page readable, trustworthy, accessible, and fully localized.

## Direction

Treat the page as one cyan method line with four stations:

1. The source
2. Coverage
3. The equality score
4. What this data cannot tell you

The line is functional wayfinding, not decoration. It links the hero, section navigation, and section sequence. Desktop uses a gently bending route; mobile uses a vertical station spine.

## Composition

- Hero: a compact station entrance with a `Rights line · Method` service label, the existing title and lede, and a route diagram that links to all four sections.
- Source: a cyan-wash station panel with the ILGA explanation, refresh cadence, and a direct external link.
- Coverage: a departure-board module using the three existing live values.
- Equality score: a visual 0–100 rail centered on 50, followed by the existing explanation. A reversed ink callout states that the score describes law on paper and is not a safety rating.
- Limits: an `Off the map` terminal panel using an ink-reversed surface, the existing limitations, correction note, and route back to Rights.

## Design-system rules

- Reuse the existing Anton display face, Space Grotesk body face, paper/ink palette, track tokens, radii, and shadows.
- Use cyan as the page's single route accent. Yellow is reserved for the score caveat; no rainbow background or decorative multi-accent wash.
- Containers use tinted fields and soft shadow rather than heavy keylines.
- Station rings remain ink-outlined and preserve high contrast in both themes.
- Buttons use direct copy, solid ink, and the established hard colored hover shadow.
- Copy stays sober where the subject concerns safety and legal limitations.

## Interaction and accessibility

- Preserve section anchors, URL deep links, scroll restoration, loading, and error behavior.
- Route links expose clear focus states and current-section state.
- Motion is limited to route progress and small station/CTA transitions; reduced-motion preferences disable it.
- Mobile retains a linear reading order and does not depend on SVG geometry for navigation.
- Existing translated strings remain the source for visible content; additions use translation fallbacks.

## Scope

This is a focused page redesign in the existing React/Tailwind stack. It does not change the rights data model, equality-score calculation, global header/footer, or other editorial pages.
