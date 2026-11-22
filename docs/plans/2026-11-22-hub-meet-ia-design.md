# Hub vs Meet — information architecture (design, 2026-11-22)

## Context
Header "Meet" links to `/hub/people`, so a public discovery tab lands inside the signed-in Hub. Measured on prod and in code:
- Hub = 4 tab groups × 3–4 sub-tabs, plus a chip row on `/hub/people` → 3 nav layers.
- `/hub` Overview showed only "Messages · 5 unread" for a real account.
- Public pages (people, groups, feed) and private ones (plans, saved, messages) share one tab bar (`src/config/hubModules.ts:61-187`).
- Signed-out "Meet" clicks land in an account area; `/hub` itself is an AuthGate (`HubPage.tsx:78-83`).
- Highlighting disagrees: `/hub/people` lights **Meet** on desktop, **Hub** on mobile (`MobileBottomNav.tsx:174`); Meet goes dark on `/hub/feed` (missing from `activeOn`).
- Mobile Explore sheet hides all Meet destinations "because they live in the Hub sheet" (`MobileNavSheet.tsx:36-44`).
- Members (`/hub/members`) and People (`/hub/people`) are two directories with two labels.

## Rule
**Meet = places and people you can find (public). Hub = things that belong to you (signed-in).** One tab row per area. Nothing appears in both.

## Target map

| Area | Route | Tabs | Anon |
|---|---|---|---|
| Meet (header tab, Explore sheet) | `/meet` | People · Groups · Travel buddies · Nearby · Dating | Public; Dating tab hidden, sign-in gated |
| Hub (avatar menu, dock) | `/hub` | Today · Plans · Saved · Friends · Feed · Progress | AuthGate explainer, no Meet links |
| Messages | `/messages` | — | per existing `docs/plans/2026-11-22-messages-page-design.md` (PR 1 not yet shipped) |
| Profile / Settings | `/user/:id`, `/settings/*` | unchanged | unchanged |

Decisions taken in this session:
- Dating sits in Meet, sign-in gated, never shown to signed-out visitors.
- Members + People merge into one People directory.
- Feed is personal → Hub (consequence: `/hub/feed` stops being a public indexable page; set noindex + AuthGate).
- `/meet` (People) keeps today's city page (spaces, groups, events, map) with the member directory as a section; the in-page chip row becomes plain section headings; "Bars and cafés" becomes a single link to Going out (it duplicates that tab).
- Hub "Today" shows only non-empty modules: friend requests, next 48h, next trip, dating matches, unread count. All empty → one line "Nothing needs you right now" + links to Plans and Meet.
- Avatar menu drops "Friends" (now a Hub tab): Profile · Your hub · Settings · Extension · Admin · Sign out.

## Phases (each one PR)

1. **Meet routes** (~half day). Mount existing components under `/meet/*` in `src/routes.tsx` (`People`, `UserDirectory`, `Groups`/`GroupDetail`/`GroupInviteAccept`, `Cruising`/`IntimateOnboard`/`IntimateUserDetail`, `PeopleMode` travel/nearby). Redirect `/hub/people|members|groups/*|dating/*|travel|nearby` and the legacy aliases (`/people`, `/groups`, `/dating`, `/cruising`, …) to `/meet/*`, preserving params and invite tokens. Update `INTENT_NAV` Meet `href`/`activeOn`/children (`src/config/navigation.ts:280-310`), `DESTINATIONS`, and unhide in `MobileNavSheet.tsx`. Update edge known-path list (`functions/_lib/agentHttp.ts`) and any sitemap generator that emits `/hub/people|groups`.
2. **Hub personal-only** (~half day). `HUB_MODULES` → single section list Today/Plans/Saved/Friends/Feed/Progress; `HubNav.tsx` one row; `MobileHubSheet.tsx` personal tiles only; `/hub/feed` noindex + AuthGate. Remove "Friends" from avatar menu (`Header.tsx:190-258`) and You sheet.
3. **Today** (~half day). Rework `OverviewModule` per the rule above; add next-trip card (reuse trip-context data behind the countdown bar).
4. **Meet page cleanup** (~2 h). Chip row → headings, Bars chip → "Going out" link, member directory section on `/meet`; Dating tab visibility gated on auth (and on intimate opt-in if one exists).
5. Messages move — already planned in `2026-11-22-messages-page-design.md` PR 1; sequence after phase 2.

Status: approved 2026-11-22. Not built yet.

## Verification
- Update/extend the existing contract tests: `src/config/__tests__/navigation.test.ts`, `hubModules.test.ts`, `src/components/hub/__tests__/hubNavConsistency.test.ts`, `src/__tests__/hubLinksContract.test.ts`, `intentNavRouting.test.tsx`. Add: every old `/hub/<discovery>` URL redirects to `/meet/*`; no route appears in both Meet and Hub nav.
- `npm test`, `npm run typecheck`, `npm run lint`.
- Prod after deploy (signed-in and signed-out browser contexts): Meet tab lit on every `/meet/*` page on desktop and mobile; `/hub/people` → `/meet` 301/redirect; signed-out sees no Dating tab; `/hub` anon shows AuthGate; group invite link round-trips; crawler fetch of `/meet` returns 200 with canonical `/meet`.
