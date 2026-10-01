# Help safety shell redesign

## Decision

`/help` and `/help/:country` become a dedicated crisis-support mode rather than ordinary public pages. The existing triage logic remains the product core; the redesign removes global chrome and fixes localization, privacy-control, mobile-collision, and page-length problems around it.

## User outcome

A distressed visitor must be able to answer four questions immediately:

1. What do I do in immediate danger?
2. Is this help correct for my country and language?
3. Who can I contact right now?
4. What can I do if I cannot or do not want to call?

## Approved direction

- Replace the public header, breadcrumbs, trip bar, footer, mobile dock, feedback button, install banner, and other peripheral chrome on help routes with a compact safety header.
- Keep the Queer Guide wordmark, a country-aware emergency action, Hide Screen, Quick Exit, and one explicit route back to the main site.
- Move Quick Exit out of the floating layer so it cannot be covered by the header or overlap content.
- Keep the existing recommendation, availability, call, non-voice, closed-line fallback, police-contact warning, and self-help behavior.
- Expose supported languages and recommendation reasons beside the primary service.
- Make the acute-danger number country-aware and synchronous, including Australia `000`.
- Preserve emergency and exit actions while self-help is open.
- Reduce the lower page to the hotline directory plus three intent-led secondary support paths. End with reassurance and a repeated route to immediate help; omit the global footer.
- Keep the route animation-free and preserve the incumbent black, cream, and red visual language.

## Accessibility and safety constraints

- Escape closes an active dialog or sheet first; it must not unexpectedly navigate away. Quick Exit remains an explicit, large labeled action.
- Every critical action remains a semantic link or button with a visible label.
- The page must reflow at 320px without horizontal scrolling or fixed-overlay collisions.
- Emergency content must render even when translations or CMS data fail.
- Red is reserved for immediate danger and concrete safety warnings.
- No new motion is introduced.

## Verification

- Unit tests for route detection, safety-shell chrome suppression, country emergency numbers, recommendation reasons, and Quick Exit behavior.
- Existing help crisis, locale, and accessibility suites.
- New E2E assertions for absent global chrome, collision-free safety controls, Australian `000`, and preserved safety actions inside self-help.
- Production deployment through Cloudflare Pages followed by the same focused E2E suite against `https://queer.guide`.
