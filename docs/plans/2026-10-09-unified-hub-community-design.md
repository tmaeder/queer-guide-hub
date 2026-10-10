# Unified Hub community design

## Goal

Make Hub the single coherent home for community, connection, and personal activity. The current release separates the public Feed and personal workspace under `/hub` from Members, Friends, Groups, Dating, Travel buddies, and Nearby under `/people`; separate shells and navigation make them feel like unrelated products.

## Information architecture

The Hub uses one grouped, responsive navigation on every Hub screen:

- Home: Overview
- Community: Feed, Members, Friends, Groups
- Connect: Discover people, Dating, Travel buddies, Nearby
- Personal: Messages, Plans, Saved

The canonical routes are:

| Destination | Canonical route |
| --- | --- |
| Overview | `/hub` |
| Feed | `/hub/feed` |
| Members | `/hub/members` |
| Friends | `/hub/friends` |
| Groups | `/hub/groups` |
| Group invitation | `/hub/groups/invite/:token` |
| Group detail | `/hub/groups/:groupId` |
| Discover people | `/hub/people` |
| Dating | `/hub/dating` |
| Dating onboarding/profile | `/hub/dating/*` |
| Travel buddies | `/hub/travel` |
| Nearby | `/hub/nearby` |
| Messages | `/hub/messages` |
| Plans | `/hub/plans` |
| Saved | `/hub/saved` |

## Compatibility

Existing `/people/*`, `/community/*`, `/friends`, `/groups`, `/dating`, `/cruising`, `/discover`, and related detail/invitation routes redirect to their canonical `/hub/*` destinations. Redirects preserve locale, query parameters, and route parameters.

The migration changes navigation and canonical locations only. Existing data hooks and feature components continue to own friend requests, group membership and management, connection discovery, privacy/consent gates, and authentication behavior.

## Shell behavior

- Every canonical route renders the same Hub navigation before its existing feature content.
- The navigation is grouped so the larger destination set remains understandable and horizontally scrollable on narrow screens.
- Feed remains public.
- Existing signed-out gates for private Hub modules and consent-sensitive connection features remain intact.
- The former People navigation and separate People product identity are retired after compatibility redirects are in place.

## Verification

- Route and redirect unit tests cover canonical, legacy, localized, parameterized, and query-preserving navigation.
- Production-style Playwright coverage exercises all Hub destinations, legacy redirects, authentication gates, and mobile overflow.
- Existing People, Community, Groups, Friends, Hub, service-worker, accessibility, lint, typecheck, and build checks remain green.
- A production smoke and browser run confirms the deployed build ID and verifies that service-worker activation does not restore stale routes.
