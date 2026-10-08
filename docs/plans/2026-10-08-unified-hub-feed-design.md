# Unified Hub and community feed

Date: 2026-10-08  
Status: Approved

## Goal

Bring the personal Hub and the public community feed into one coherent destination without making public community content require authentication or disrupting existing Hub deep links.

## Chosen approach

Add the existing community feed as a fifth Hub module at `/hub/feed`.

- Hub navigation becomes **Overview · Feed · Messages · Plans · Saved**.
- `/hub/feed` remains publicly readable.
- Posting, liking, commenting, and the personal modules retain their existing sign-in requirements.
- `/community/feed`, `/community`, and `/feed` redirect to `/hub/feed`, preserving locale and query parameters.
- The Hub shell renders for signed-out visitors; authentication moves from the whole Hub page to the private modules.
- Existing feed data hooks, composer, filters, pagination, moderation, and post cards are reused.

## Information architecture

| Module | Route | Access |
| --- | --- | --- |
| Overview | `/hub` | Signed in |
| Feed | `/hub/feed` | Public; interactions retain their current auth rules |
| Messages | `/hub/messages` | Signed in |
| Plans | `/hub/plans` | Signed in |
| Saved | `/hub/saved` | Signed in |

The desktop shell keeps its sidebar. On mobile, the fifth destination uses an overflow-safe horizontal module bar so every label remains readable and no control is compressed into an ambiguous icon-only target.

## Routing and compatibility

- Add a static `/hub/feed` route so it cannot be consumed by the optional locale segment.
- Keep `/hub` as the existing personal overview to preserve bookmarks and user expectations.
- Redirect legacy feed URLs into `/hub/feed` using the locale- and query-preserving redirect helper.
- Keep `/people` as the public people-discovery area; remove Feed from its local navigation so there is one canonical feed home.
- Preserve canonical metadata for the feed at `/hub/feed`.

## Component boundaries

- Add `feed` to the Hub module registry.
- Render the existing `Feed` page inside `HubPage` as the public module.
- Apply `AuthGate` only to private Hub module content instead of wrapping the whole shell.
- Add an embedded presentation mode to `Feed` so the Hub owns the outer container and heading hierarchy while the feed keeps its established loading, error, empty, search, sorting, pagination, and composer behavior.

## Verification

- Unit tests prove the Feed module renders without authentication.
- Unit tests prove private modules remain gated.
- Registry and route tests cover `/hub/feed`.
- Redirect tests prove `/community/feed` and `/feed` resolve to `/hub/feed` with locale/query preservation.
- Feed tests cover both standalone-compatible behavior and embedded rendering.
- A production build or scoped typecheck/test run verifies integration.
- Browser verification covers signed-in Hub navigation and a signed-out/public feed state when available.

