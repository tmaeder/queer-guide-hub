# App privacy — App Store labels and Play Data safety

Each row is traced to the code that sends it. **Tracking: none** — no ad SDK,
no analytics SDK, no IDFA/AAID access, no data shared with data brokers.
Everything is encrypted in transit (HTTPS only).

## What leaves the device

| Data (Apple category) | Sent by | Linked to the user? | Purpose | Optional? |
|---|---|---|---|---|
| Email address (Contact Info) | `src/features/auth/api.ts` sign-up / sign-in | Yes | App Functionality (account) | Yes — no account needed to browse |
| User ID (Identifiers) | Supabase session JWT on API calls when signed in | Yes | App Functionality | Yes |
| Coarse location (Location) | `src/api/venues.ts` and `src/api/events.ts` send the map viewport; after "Near me" at zoom 14 that is a few-km box around the user | **DECISION**, see below | App Functionality | Yes — location permission is optional |
| Search history (Search History) | `src/api/search.ts` → search-proxy → `log_search` (query, filters, result count; **no user id, no session id** from the app) | No | App Functionality, Analytics (search quality) | Yes — search is optional |
| Saved places (User Content → Other) | `src/features/saved/sync.ts` — **only once PR #5023 merges**, and only when signed in | Yes | App Functionality (sync) | Yes |
| Device push token (Identifiers → Device ID) | `src/features/push/push.ts` — **only once PR #5020 merges**, opt-in | Yes | App Functionality (notifications) | Yes |
| Account deletion request | `delete-account` edge function | Yes | App Functionality | — |

Precise location is **not collected**: `getCurrentPositionAsync` feeds only
the map camera (`src/app/(tabs)/index.tsx`). Background location is blocked
in the Android manifest.

Not collected: name, phone, physical address, health, financial, contacts,
photos, audio, browsing history, crash data, performance data, other
diagnostics. If Sentry or any crash reporter is added, this file and both
store forms must change in the same PR.

Third parties that receive requests (IP address only, no payload about the user):
map tiles from `protomaps-tiles.maeder-tobiassimon.workers.dev` (receives the
tile coordinates, i.e. the viewport — same consideration as coarse location),
fonts/sprites from `protomaps.github.io`.

## Play Data safety answers

- Does the app collect or share user data? **Collects: yes. Shares: no.**
- Encrypted in transit: **yes**. Users can request deletion: **yes** —
  in-app (Me → Account → Delete account) and at https://queer.guide/privacy.
- Collected types: Email address, User IDs, Approximate location, App
  interactions → "In-app search history"; plus Device or other IDs and Other
  user-generated content once PRs #5020 / #5023 ship. All optional except
  where the user creates an account.

## DECISION — is coarse location "linked"?

The viewport request carries the user's JWT when signed in, so the backend
could associate it with an account through request logs. Two honest options:

1. Declare Coarse Location as **linked** (conservative; matches today's code).
2. Send viewport and search requests with the anon key even when signed in,
   then declare it **not linked**. Cost: signed-in users lose access to
   safety-gated places on the map, which is the reason the JWT is attached —
   so this option is not free.

Recommendation: option 1 now.
