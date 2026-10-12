# Feedback repairs

Approved by the user on 2026-10-12 after review of the 12 unresolved stories in /admin/feedback.

Fix and verify message whitespace and profile name/avatar saving, reusing any fixes already on main. Add an own-profile shortcut to saved favorites. Keep venue recommendations local and display venue type icons. Repair the reported Illy website and preserve automatic link checking. Normalize dialable phone numbers using the entity's country context. Add event type pictograms and a visible legend. Reuse venue reviews for a 0–5 rating with clear labels. Remove mayor/university facts from public city pages. Confirm navigation to external websites with a concise destination notice.

Investigate all unresolved automation and merchant error reports. Repair bounded work, contention and upstream failures without suppressing real failures. Use later successful runs as recovery evidence. Keep externally blocked reports explicit, including exhausted paid-provider credits, rather than marking them fixed.

Keep unrelated work isolated. Verify behavior with focused regression tests, type/lint checks, a production build and browser checks. Close each story only when its requirements are verified and its implementation is available.

## Verified implementation

Implemented own-profile Favorites access, same-city venue recommendations with category icons, event icons and a legend, 0–5 public ratings on existing venue reviews, external website confirmation, and university-list removal. All new copy is translated in 11 locales. Existing message whitespace, profile name/avatar writes and international phone links passed regression and authenticated database checks.

Both bounded event crawlers completed successful production probes. OH MY! FANTASY and five additional merchants recovered using verified public Storefront tokens; no merchants remained failing after the probes. Failure recovery now handles recurrence and late/out-of-order successes, and HTTP 200 responses with success:false count as failures. Variant claims scan a bounded window and advance a private cursor; database timing and production endpoint checks passed.

Five new migrations are applied and recorded with exact repository versions. Three pre-existing remote-only entity-location migrations were recovered byte-for-byte to unblock deployment. Tests cover UI controls, merchant transport/reporter behavior, work budgets, authenticated own-profile updates, zero ratings, recovery ordering, HTTP failure accounting and claim-cursor progress. Production build, typecheck ratchet, targeted lint and desktop/mobile browser checks passed.

External blockers remain explicit: Illy's CloudFront origin returns 502; Firecrawl has insufficient credits; AWIN lacks Create-a-Feed access/key; Nominatim refuses edge requests with 403 and both configured Overpass mirrors failed their control probes. No externally blocked report is marked fixed.
