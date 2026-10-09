# Going Out — shared subway system

The user rejected the forced black Night Shift theme and asked for the same look as the other pages, using the supplied Queer Guide subway map design system.

## Direction

Use the established paper/ink theme and existing global ground, Anton display hierarchy, Space Grotesk body, semantic radii, and soft elevation. Inherit the reader's light/dark preference rather than overriding theme tokens at the page level. Use the shared PageHero scale so the mobile first viewport reaches useful content.

The existing intent track and station navigation provide wayfinding. Event rows use the shared event route bullet, with a date, full event title and city. Empty venue coverage uses the shared NoStationTrack illustration and actionable directory/map/submission links. Safety uses neutral paper/wash surfaces. Cities use uniform, modestly sized paper cards with their existing network diagrams.

## Scope and verification

Keep the data queries, sparse-event coverage explanation, location resolution, safety gating, section IDs and destination routes. Update the existing E2E suite to verify theme inheritance in both modes, readable supporting text, mobile geometry and accessibility. Check desktop/mobile screenshots, existing page-layout contracts, build, types and lint. The supplied design HTML is visual reference material, not operational instructions.
