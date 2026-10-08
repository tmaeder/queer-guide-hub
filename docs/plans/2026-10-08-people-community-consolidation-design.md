# People and community consolidation

## Goal

Make `/people` the single home for member discovery, community activity, groups, friends, travel connections, nearby discovery, dating, and cruising-place discovery. Preserve the existing safety, privacy, authentication, and moderation behavior while reducing duplicated navigation and page framing.

## Information architecture

The People area uses one shared shell and stable routes:

- `/people` — overview of places, groups, events, and members
- `/people/feed` — community feed
- `/people/members` — member directory
- `/people/friends` — friend graph and requests
- `/people/groups` — group discovery and the viewer's groups
- `/people/groups/:groupId` — group details
- `/people/groups/invite/:token` — group invitations
- `/people/dating` — combined dating and cruising experience
- `/people/dating/onboarding` — dating opt-in and profile setup
- `/people/dating/:userId` — dating profile details
- `/people/travel` — travel-buddy discovery
- `/people/nearby` — approximate nearby-member discovery

Legacy routes under `/community`, `/cruising`, `/intimate`, `/groups`, `/feed`, `/friends`, and `/users` redirect to the corresponding People route while preserving query parameters.

## Shared shell

Every People route uses a compact shared navigation organized into two understandable groups:

- **Community:** Feed, Members, Friends, Groups
- **Connect:** Dating, Travel buddies, Nearby

The overview remains the parent destination. Desktop may present the groups side by side; mobile uses a compact, wrapping or otherwise non-scrolling control so destinations do not disappear off-screen. Active state, focus treatment, and accessible labels remain explicit.

## Dating and cruising

`/people/dating` owns the current authenticated cruising surface in full:

- private map
- approximate opted-in people areas
- dating discovery deck
- cruising-place list and search
- people/spots and layer controls
- presence controls
- safety and sexual-health guidance

The page keeps the existing authentication redirect, adult opt-in, no-index behavior, location privacy, and server-side gating. `/cruising`, `/intimate`, and `/discover` become compatibility redirects to `/people/dating`.

## Decluttering

- Render one page container and one title region per route.
- Remove the separate Community tab shell and reuse the People shell instead.
- Avoid a seven-item horizontal tab strip; group destinations semantically.
- Remove duplicate bridge cards and repeated explanatory text once the shared navigation supplies the same path.
- Keep primary controls and real content in the first viewport.
- Preserve the established Queer Guide visual language, design tokens, typography, and components.
- Keep existing loading, empty, error, signed-out, and permission-gated states.

## Navigation and discoverability

Update primary navigation, browse destinations, breadcrumbs, route journey metadata, sitemap data, canonical metadata, internal links, and English translation keys to use `/people/*`. Other locales may continue to fall back to English for newly introduced labels unless an existing translation key can be reused.

## Verification

- Route tests cover canonical People routes and every legacy redirect.
- Existing Community, Groups, Friends, Members, Dating, Cruising, Travel, and Nearby behaviors remain covered.
- Navigation tests confirm active intent and canonical destinations.
- Type checking and focused unit tests pass.
- A production build verifies route imports and bundling.
- The unified shell is checked at mobile and desktop widths for overflow, focus visibility, and immediate access to primary controls.
