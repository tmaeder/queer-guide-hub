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

## Approved polish pass and production reconciliation

The follow-up uses a care-first editorial direction with a small amount of
Queer Guide's poster character. Production keeps the ordinary site header,
breadcrumb, route navigation, footer, and mobile dock introduced by `#4097`:
that later decision gives cold arrivals an obvious way back into the site and
keeps the portaled privacy cover above every global layer. The polish applies
inside the help route and does not restore the retired `HelpSafetyHeader`.

- Make reassurance the emotional anchor and acute danger the unmistakable
  exception, rather than giving every part of the page equal visual volume.
- Replace the stacked-card feeling with one calm primary support composition:
  the recommended service and its call/write actions on one side, and practical
  call expectations on the other at wide breakpoints.
- Keep Hide Screen and Quick Exit directly below the emergency strip, within
  the ordinary content column and above the fold at supported breakpoints.
- Give call and non-voice contact routes equal clarity without presenting a
  distressed visitor with a menu of low-level channel metadata.
- Turn directory controls into a compact toolbar and align hotline rows around
  name, availability, essential metadata, and one obvious primary action.
- Reduce lower-page support into three intent-led routes: local support, rights
  and safety, and helping someone else.
- Use cream as the page field, near-black for editorial structure, and reserve
  red for acute danger and concrete warnings. Use whitespace and rules before
  adding more bordered containers or shadows.
- Preserve the condensed display face selectively for character; use the body
  face for instructions and high-stress actions where rapid reading matters.
- Give 320–430px layouts a dedicated pass: no clipped labels, overlapping fixed
  controls, horizontal overflow, or action rows that depend on icon recognition.
- Add no decorative motion. Hover, pressed, and focus-visible states may change
  color or opacity immediately and must remain legible in reduced-motion mode.

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
