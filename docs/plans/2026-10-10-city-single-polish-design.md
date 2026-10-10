# City singles — subway design polish

Approved to proceed in chat on 2026-10-10.

City pages help a reader decide where to go, understand safety and geography,
and plan a visit. Implement the supplied subway reference through the existing
Anton/Space Grotesk typography, paper/ink surfaces, semantic track colours and
station components. Sample numbers and claims in the reference are not data.

## Layout

- Compact city masthead with a short introduction, one trip action, one Save
  control and secondary actions in the existing overflow menu.
- Keep explicit risk warnings above the overview. Put the safety verdict,
  a compact two-column essential-fact strip and the real map in the opening.
- Keep places, districts and upcoming events as visible station/departure rows.
  Use the shared horizontal section navigation and preserve its deep links.
- Keep full description, photograph, reference facts, travel, news and discovery
  accessible through disclosures. Do not duplicate the introduction in About.
- Replace the large closing promotional panel with simple city/country links.
  Retain dated provenance and the correction action.

## Declutter decisions

Remove the second city identity bullet and masthead counts derived from capped
preview queries: those counts cannot assert the total number of stops or events
in a city. Compact facts use tonal surfaces instead of a framed grid. Additive
compact shell and fact variants keep this pass scoped to cities. Safety retains
its existing semantic colours and country risk behavior.

## Verification

Check city rendering, airport meaning, description preservation, risk warnings,
Save/overflow keyboard behavior, hash disclosure navigation, empty data, real map
context and responsive overflow. Inspect rich and sparse city pages at desktop
and mobile sizes, plus dark mode and accessibility. Run the focused unit tests,
changed-file lint, typecheck and a production build. Live baseline failures are
not evidence about the local implementation.
