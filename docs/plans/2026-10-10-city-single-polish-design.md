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

## Implemented and verified locally

- Compact city shell and tonal fact strip; remove repeated city identity,
  capped-query totals and the oversized closing callout.
- Sentence-aware opening excerpts keep complete descriptions and any shortened
  editorial hooks available in About. Sparse cities do not reserve an empty
  map column.
- Wait for the city ID before requesting venues/events. Previously the first
  render sent an unfiltered global request that could race the scoped request,
  inject unrelated venues and zoom the map across continents.
- Restricted-content copy states the sign-in requirement without inventing a
  legal-risk cause. Explicit country warnings and the safety verdict remain.
- 66 focused unit tests pass, as do changed-file lint and the production build.
- Five local browser checks pass: Berlin desktop/mobile, deep-link disclosure
  and focus, risk-dependent rights detail, heading order and serious/critical
  accessibility checks. The separate six-render inspection includes Edinburgh,
  Kabul, dark mode and German mobile; all have zero horizontal overflow.
- Final screenshots and measured inspection data are saved under
  `../outputs/city-polish/`. Berlin's map contains its own local markers; Kabul
  shows no public venue rows. Default page heights are 4,886px desktop and
  6,639px mobile for Berlin, 5,198px mobile for Edinburgh, and 5,755px mobile
  for Kabul. These are current measurements, not comparable before/after claims.

The 83 design-token contrast checks also pass. The whole-project typecheck
finished with one new TS6192 group in the separately modified
`src/pages/EventDetail.parts.tsx` (unused `EntitySocialLinks` import); it reports
no new city-page error groups. The unrelated event edits were preserved. No
deployment was performed; the local preview is on port 5175.

## Release preparation

The deployment is isolated on the current production branch. Production's city
name localization, own-airport fact semantics, nearest-airport travel details,
map camera/back links and risk-specific restricted-content copy are retained.
Shared disclosure behavior is additive; other single-page types keep their
existing default presentation. The city-specific browser suite and the shared
single-page rail assertion reflect the inline city overview. Release checks
and deployment status are reported by the pull request and Pages workflow.
