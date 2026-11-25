# Meet incremental consolidation

Approved by the user's implementation request on 2026-11-25, following the
source review and recommendation in this chat.

Mode: Operate. Extend the existing paper/ink and subway wayfinding system.

## Delivery order

1. Dating opens the existing strict mutual discovery UI directly. Cruising has
   an explicit `/people/cruising` destination and retains its existing gates.
2. Explicit city, event and trip context survives discovery links. The public
   gathering-place map follows the selected city. Inferred location is never
   added to URLs or published as presence.
3. Shared discovery distinguishes authentication, consent, loading, query
   failure, profile loading and an actual empty result. Failed profile loads
   do not become anonymous placeholder cards. Both queries support retry.
4. A shared Meet page frame owns navigation, page heading and contextual
   actions. Existing community page bodies remain reusable when embedded.
5. Primary navigation is Discover, People, Groups, Dating and Connections.
   Member browsing, friendship discovery, Travel buddies and Nearby are
   secondary People destinations. Existing routes remain valid.
6. Put groups, upcoming events and opt-in member discovery ahead of places and
   the map on the overview. Global and local wayfinding share one registry.

## Boundaries

Preserve the incumbent paper/ink design and localized routing. Dating keeps
the approved strict reciprocal server eligibility and consent rules; it does
not use generic discovery as a fallback. Browsing a location and broadcasting
presence remain distinct. Conversations remain in the unified inbox, with
contextual links from Meet. No production deployment or schema change is
part of this implementation.

## Verification

Cover dating route selection, legacy cruising entry, context propagation,
map city positioning, discovery failures/retry and hydration, opt-in gates,
primary/secondary navigation and embedded page headings. Run focused tests,
lint, the type-check gate and build; inspect desktop and mobile layouts.

## Implementation evidence from the original checkout

- 137 focused tests pass across 20 files, including discovery and profile
  failures/retry, unavailable/changed city resolution, public map centering,
  trip context, navigation, private route indexing and existing dating gates.
- Scoped ESLint, locale synchronization, duplicate-key and copy checks pass.
  The deterministic scan of the shared Meet components reports no findings.
- The type-check ratchet passes: 755 existing errors versus the 794-error
  baseline, with no new errors. The baseline was not changed.
- Production compilation and bundle-shape checks pass. Browser inspection
  covers the built sign-in entry and the shared desktop/mobile layout;
  authenticated discovery behavior is covered with test fixtures.
- Changes are local. No deployment, profile mutation, message, or database
  migration was performed for this consolidation.

## Production integration

The deployment request is based on production commit `46bcc6666`. Production
now uses `/meet` as the discovery home. Keep its newer travel meetups, live
presence, profile markers, map modes, and privacy/Hub separation. Connections
therefore links to the existing `/hub/friends`; it is not a second friends home.
The legacy cruising URL opens the live map's cruising layer. Dating already
opens people on current production, and retains its strict matching UI.

Port the shared loading/error/profile lifecycle, explicit context continuity,
city-centred public map, grouped navigation and standard page frame onto this
base. No schema changes are required.

Release validation on the current production base: 137 focused tests across
22 files, clean scoped lint, a successful production build, and complete locale
checks. The type-check ratchet reports 593 existing errors with no new errors
against its 596-error baseline. Existing baselines were not changed.
