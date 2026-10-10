# Event single simplification

Approved by the user on 10 October 2026.

Keep the shared subway single shell, Anton and Space Grotesk, paper/ink tokens,
event bullet, section route, provenance and factual event data. Preserve existing
cultural-context work.

Present the masthead and equal-weight tags, followed by one canonical fact strip
and one action group. Tickets or planning is the primary action; RSVP remains
available to signed-in readers. Save, sharing and calendar stay together.
Website, reporting, visited state and editor tools remain available through a
labelled disclosure. Remove repeated price/date/time/location summaries and the
competing mobile action overlay; mobile uses the same action group near the top.

Content follows about, programme when populated, getting there, and attendance
when populated. Related discovery stays below the main content. Empty modules
remain absent; safety warnings, timezone controls, past-event restrictions,
programme relationships, SEO and authentication behavior remain intact.

Validate event component tests, type checking, lint and desktop/mobile rendering.

## Implemented and verified

- One fact strip and one action group on desktop and mobile; no mobile action overlay.
- Ticket and trip controls preserve past-event gating. RSVP toggles and calendar callbacks are tested.
- Secondary tools live in a native keyboard-accessible disclosure. Website, reporting,
  visited state, sharing and editor access remain available.
- Duplicate ended state, about label, venue links and enclosing venue cards removed.
- Sparse about/location sections and their route stations are omitted. Destination safety
  remains available independently of venue content.
- Equal-weight tags initially show six with expansion to the complete list.
- Five new utility/action labels translated in all eleven locales, with public bundles synced.
- 30 tests pass across four event test files. Changed files pass lint and formatting.
  Locale duplicate-key check passes. Initial mechanical design detector returned no findings.
- Browser confirmation at 1440px and 390px found one h1, one ticket link and one action
  group, no horizontal overflow and no serious/critical WCAG A/AA axe violations.
  The upcoming-event browser fixture alters dates, description and ticket availability
  in intercepted read responses only; no event data was written.
- Screenshots are in `outputs/event-polish/` in the workspace parent. The first pair
  uses the real past event; the upcoming pair uses the explicit browser fixture.
- Full repository typecheck passes its existing regression ratchet: 768 existing
  diagnostics against a baseline of 794, with no new errors. The shared baseline
  was not rewritten as part of this UI change.
