# Meet: Dating, Members, Identity — one person, one profile (design, 2026-11-24)

## Context

Three surfaces describe the same person and do not connect:

- `/settings/identity` (`ProfileEditor` → `IdentityTab` + `IntimateTab`) mixes identity, coming-out, relationships and the full 18+ profile on one very long page.
- `/meet/dating` (`src/pages/Cruising.tsx`) is a cruising map (55,634 spots) with people as a side panel. Its detail page `/meet/dating/:userId` (`IntimateUserDetail.tsx`) has no Like button and no Message button.
- `/meet/members` (`UserDirectory.tsx`) links to `/user/:id`, which never links to the dating profile. The reverse link is missing too.

Measured on prod (2026-11-24): 28 profiles, 28 opted-in, 0 likes, 0 matches. No data migration is needed. The work is structural.

Defects found:
1. `IntimateUserDetail.tsx:178` shows `limits`. `IntimateTab.tsx:341` promises hard limits are "never shown". Latent: 0 rows have limits today.
2. The members filter reads `profiles.relationship_status` (0 rows) while settings writes `current_relationship_status`.
3. Onboarding asks `into`/`limits`. Settings cannot edit them afterwards, yet discovery filters on `into_tags`. `seeking` and `about_intimate` cannot be edited anywhere.
4. Matches link to `/hub`, not the conversation. `/intimate/onboard` is hard-coded in 5 places. `IntimateDiscovery.tsx:245,249` use non-localized `Link`.
5. The `has_children` and `has_pets` filters have no writer.

User decisions (2026-11-24):
- Dating gives the profile list and the cruising map equal weight.
- One profile per person. Dating is a layer on `/user/:id`, visible only between opted-in members.
- Settings splits into "Identity" and "Dating & 18+".

## Target structure

| Surface | Route | Content |
|---|---|---|
| Members | `/meet/members` | Directory. Cards link to `/user/:id`. Opted-in viewers see a small "Dating" mark on opted-in members' cards that links to `/user/:id/dating`. |
| Dating | `/meet/dating?view=profiles\|map` | Two equal modes behind one toggle. **Profiles**: discovery list/deck, a matches strip on top (each match opens its Messages conversation). **Map**: today's cruising map (spots + approximate people areas). Default view: last used (localStorage), else profiles if opted-in, else map. |
| Profile | `/user/:id/dating` | 4th tab, rendered only when viewer and target are both opted-in and not blocked. Content: today's `IntimateUserDetail` body, without limits, plus Like/Pass (`LikePassActions`) and Message once matched. |
| Settings | `/settings/identity`, `/settings/dating` | Identity: `IdentityTab` only. Dating & 18+: `IntimateTab` as the single editor for every intimate field. |

Redirects:
- `/meet/dating/:userId` → `/user/:userId/dating`
- `/settings/intimate` → `/settings/dating`
- `?panel=people` → `?view=profiles`

Rules:
- **Limits** are used only to exclude matches. They are never displayed, to anyone.
- **The settings route must be literal** (`settings/dating`). A `settings/:section` pattern loses to `/:locale?/…`, which is the trap the existing comment in `routes.tsx` records.
- **One editor.** Onboarding stays a wizard, but it walks the same `IntimateStepFields` steps that the settings page edits.

## Phases (one PR each)

### 0. Design doc (~15 min)
Write this design to `docs/plans/2026-11-24-meet-dating-identity-design.md` and commit it.

### 1. Fixes (~2 h)
- Remove the Limits row in `src/pages/intimate/IntimateUserDetail.tsx`.
- `src/hooks/useUserDirectoryQuery.ts` and `src/components/user-directory/UserDirectoryGrid.tsx`: switch `relationship_status` to `current_relationship_status`. Drop the `has_children`/`has_pets` filters.
- Matches link to the match conversation. `intimate_matches` and the `on_intimate_like_inserted` trigger already create a `conversations` row of type `match`. Read its id and link to Messages.
- Replace the five `/intimate/onboard` literals with localized `/meet/dating/onboarding`: `IntimateTab`, `CruisingPresenceControl.tsx:59`, `KinkShareView`, `KinkChecklist`, `WorkbookRunner`. Use `LocalizedLink` at `IntimateDiscovery.tsx:245,249`.

### 2. Settings split (~half day)
- `src/pages/Settings.tsx`:
  - Add `dating` to `SettingsSection`, `NAV` ("Dating & 18+", the Heart icon) and the `GROUPS` "You" group.
  - Rename `identity` to "Identity".
- `src/components/profile/ProfileEditor.tsx:402-424`: the identity branch renders `IdentityTab` only. The new `dating` branch renders `IntimateTab`.
- `IntimateTab.tsx`: add the missing fields by reusing `IntimateStepFields` steps — `into`, `limits`, `seeking`, and `about` (`textParts` "about", wired to the existing `intimate_set_text` RPC).
- `src/routes.tsx`: add the literal `settings/dating` route. Repoint the `settings/intimate` redirect.
- `src/lib/profileEditing.ts` `legacySettingsDestination()`: map legacy intimate URLs to `dating`.
- Repoint `IntimateDiscovery.tsx:249,293` "edit" links to `/settings/dating`.

### 3. Dating layer on the profile (~1 day)
- `src/pages/profile/ProfilePage.tsx:37`: add `'dating'` to `TABS`, shown conditionally.
- **Visibility check.** Visibility = viewer opted-in AND target row readable through RLS `intimate_profiles_mutual_read` (which already encodes opted-in + approved + unblocked). A failed read hides the tab.
- Move the `IntimateUserDetail` body into a `DatingProfileTab` component. Add `LikePassActions`, and a Message button when `intimate_matches` has the pair. Keep friend request, block and report.
- **Verify first:** does `/user/:id` render for a target whose general profile is private? If `get_public_profile_safe` refuses, the dating tab renders a minimal header (name + avatar from the intimate read path) instead of 404. Same check for `intimate_discovery_v` (`security_invoker` + `profiles` join may hide private profiles).
- Redirect `/meet/dating/:userId` → `/user/:userId/dating` (`LocalizedParamRedirect`). Delete the old page component.
- Discovery cards link to `/user/:id/dating`.
- Members card: "Dating" mark when viewer and member are both opted-in. Source it from one batched read of `intimate_profiles` ids for the visible page; RLS returns only mutual-readable rows.

### 4. Dating page, two modes (~half day)
- `src/pages/Cruising.tsx`: replace `panel` + layer default with a `view=profiles|map` toggle (segmented control, two items).
  - **Profiles** view: matches strip + `IntimateDiscovery` (embedded).
  - **Map** view: today's map with the both/people/spots layers.
  - Not opted-in: the profiles view shows the onboarding CTA. The map still works.
  - Persist the last view in localStorage (try/catch).
- Delete the dead `dating` and `friends` branches in `PeopleMode.tsx:108-111`.

## Out of scope (named, not done)
- Merging the People and Members tabs. Already decided in `docs/plans/2026-11-22-hub-meet-ia-design.md`, separate PR.
- Unifying the two presence systems: `intimate_cruising_mode` and `user_presence_location`.
- An orientation filter on Members. Filtering on a privacy-gated field works as an oracle, so it needs a server-side visibility-aware filter first.
- Three different person cards (Members grid, `PersonCard`, discovery card). Deferred until after phase 3.

## Verification
- Per PR: `npm test`, `npm run typecheck`, `npm run lint`.
- Unit tests:
  - Settings: the `dating` section renders `IntimateTab` and `identity` does not.
  - `ProfilePage`: the dating tab is hidden for a non-opted-in viewer.
  - `IntimateUserDetail`/`DatingProfileTab` never renders `limits`.
  - Redirect tests: `/meet/dating/:id`, `/settings/intimate`, `?panel=people`.
- Extend the existing nav/route contract tests (`src/config/__tests__/navigation.test.ts`, `intentNavRouting.test.tsx`).
- Prod after each deploy, with the signed-in built-in browser:
  - `/settings/dating` loads, and edits to into/limits persist.
  - `/meet/members` relationship filter returns the 1 member with a status.
  - `/user/<opted-in id>/dating` shows Like and no Limits.
  - `/meet/dating?view=map` and `?view=profiles` both render.
  - In a signed-out context: no dating tab and no dating mark.
