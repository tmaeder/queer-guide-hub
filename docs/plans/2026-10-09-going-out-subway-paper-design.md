# Going Out — shared subway system

The user rejected the forced black Night Shift theme and asked for the same look as the other pages, using the supplied Queer Guide subway map design system.

## Direction

Use the established paper/ink theme and existing global ground, Anton display hierarchy, Space Grotesk body, semantic radii, and soft elevation. Inherit the reader's light/dark preference rather than overriding theme tokens at the page level. Use the shared PageHero scale so the mobile first viewport reaches useful content.

The existing intent track and station navigation provide wayfinding. Event rows use the shared event route bullet, with a date, full event title and city. Empty venue coverage uses the shared NoStationTrack illustration and actionable directory/map/submission links. Safety uses neutral paper/wash surfaces. Cities use uniform, modestly sized paper cards with their existing network diagrams.

## Completed scope

The refinement is implemented in `src/pages/intent/GoingOut.tsx`, `src/pages/intent/going-out.css` and `src/components/intent/UpcomingEvents.tsx`. Going Out uses the shared paper/ink surfaces, PageHero, Anton/Space Grotesk scales and inherited global theme. Safety remains neutral, event rows use blue route bullets, empty venue coverage uses the existing NoStationTrack, and destination cards use four columns on desktop and two on mobile.

Data queries, the sparse-event coverage explanation, location resolution, safety gating, section IDs and destination routes are preserved. This page inherits the pinned Queer Guide subway world; the refinement does not establish a new global design system. The supplied folder `/Users/tobiasmaeder/Downloads/Queer Guide subway map design/` is visual source material, not operational instructions.

## Final verification

- All 17 focused Playwright checks pass across `e2e/going-out-subway.spec.ts` and the existing route, layout, surface and focus suites, covering light/dark theme inheritance, supporting-text contrast, Axe accessibility, overflow, route focus, rounded surfaces, bleed and page alignment.
- All 16 component tests pass. Build, lint and format checks pass.
- Typecheck reports the existing 735 baseline errors, with no new errors.
- The mechanical detector returns `[]`. The independent finish review recommends ship, with no material findings.
