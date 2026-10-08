# People workspace polish design

## Goal

Turn every route under `/people` into one coherent, polished connection workspace for community, friendship, groups, dating, cruising, nearby presence, and travel companionship. Preserve deep links and the existing authentication, adult-content, consent, and privacy protections.

## Direction

Use a shared People workspace rather than restyling each page independently or merging every feature into one oversized dashboard. Each route keeps a focused job while sharing the same navigation hierarchy, page framing, responsive behavior, states, and interaction language.

## Shared workspace

- Use one compact People header and grouped Community/Connect navigation across all `/people` routes.
- Give each route a concise title, supporting sentence, and one contextual primary action where useful.
- Remove duplicated headings, nested page containers, and competing tab systems.
- Use consistent cards, borders, spacing, filters, skeletons, empty states, errors, authentication gates, focus states, and touch targets.
- Keep canonical route URLs and active navigation visible on desktop and mobile without horizontal overflow.

## Overview and map

`/people` remains the public overview and opens with the connection map.

- Add a clear map mode control for **Community** and **Cruising**.
- Community mode shows public venues, events, and queer neighbourhoods; it never shows member locations.
- Cruising mode leads into the existing protected cruising workspace at `/people/dating`, preserving the current map/list experience.
- Anonymous visitors must authenticate before protected cruising data is requested.
- Existing age acknowledgement, Safe Mode, opt-in presence, approximate location, expiration, and server-side data gates remain authoritative.
- Keep a concise set of useful discovery sections below the map, with strong links into the focused People routes.

## Route-specific experience

- `/people/feed`: prioritize the composer and feed; simplify filters and reduce ornamental framing.
- `/people/members`: lead with member search and useful filters, followed by consistent profile results.
- `/people/friends`: distinguish incoming requests, outgoing requests, and established connections.
- `/people/groups`: make Discover and My Groups explicit and keep Create Group as the primary action.
- `/people/dating`: present dating people and cruising spots as modes of one protected connection workspace, with the map and results list kept in sync.
- `/people/travel`: lead with destination and trip context, then show matching members and a clear profile/onboarding path when matching is unavailable.
- `/people/nearby`: make privacy, approximate presence, expiration, and visibility state obvious before showing nearby results.

## Responsive behavior

- Desktop uses the available width for task-focused content, including map/list layouts where appropriate.
- Mobile keeps navigation compact, presents controls in a stable order, uses full-width primary actions, and never requires horizontal page scrolling.
- Map controls must remain reachable above the fold and must not overlap browser or site navigation.

## Accessibility and content safety

- Preserve landmarks, semantic headings, active-page announcements, keyboard access, visible focus, and adequate touch targets.
- Do not expose exact member locations or cruising presence without the existing explicit opt-in.
- Adult content and cruising data remain unavailable to crawlers and unauthenticated or ineligible visitors.
- Empty states explain what is missing and offer a relevant next action without overstating available members or activity.

## Verification

- Focused unit and component tests cover the shared shell, navigation, route-specific state, and map-mode behavior.
- Production build and focused lint pass.
- Browser tests cover every canonical `/people` route, legacy redirects, Community/Cruising map modes, authentication gates, and mobile overflow.
- After deployment, repeat the read-only E2E contract against `https://queer.guide` and visually inspect the desktop and mobile People overview.

