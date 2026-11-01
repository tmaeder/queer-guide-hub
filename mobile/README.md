# queer.guide — native app

Expo (SDK 58, React Native 0.88, New Architecture) app for iOS and Android.
Strategy and technical plan: the "queer.guide Mobile App Strategy" doc.

This is its own npm project, like `scraper/` and `extension/`. The root
`npm install`, lint, typecheck and vitest never touch it.

```sh
cd mobile
npm install
npm run typecheck
npm test
npx expo run:ios      # or run:android — needs a dev build (MapLibre is native)
```

Expo Go cannot run this app: `@maplibre/maplibre-react-native` is a native
module. Use a development build (`npx expo run:ios|android`, or
`npx eas-cli@latest build --profile development` once EAS is set up).

## What's shared with the web, and how drift is caught

| Shared | Mechanism | Guard |
| --- | --- | --- |
| Database types | type-only import of `../src/integrations/supabase/types.ts` via the `@db/types` path | `npm run typecheck`; Metro never bundles it (type imports are erased) |
| Colour tokens | values copied into `src/theme/tokens.ts` | `tokens.drift.test.ts` parses `src/index.css` `:root` / `.dark` |
| Basemap | `src/map/style.ts` ports the web's paper-and-ink Protomaps flavor as a pure function; same tile Worker | `style.test.ts` checks the tile URL against `src/config/mapStyle.ts` |
| Venue categories | labels in `src/i18n/*.json` | `catalogs.test.ts` reads `VENUE_CATEGORIES` from `src/lib/venueCategories.ts` |
| Public-venue predicate | `publicVenues()` in `src/api/venues.ts` mirrors `fetchVenuesPage` | `venues.test.ts` |
| Support lines | the published `help` CMS page, same source as `/help` | `hotlines.test.ts`, `help.test.tsx` |

`mobile-ci.yml` also runs when those web files change.

## Privacy rules (hard constraints)

- No analytics, attribution, ads or third-party crash SDKs. The iOS privacy
  manifest declares no tracking and no collected data; keep it true.
- Location is foreground-only and never sent to the server. Background
  location permissions are explicitly blocked on Android.
- Saved places live only on the device (AsyncStorage) while signed out.
  Signed in they are the account's `venue_favorites` (merged on sign-in);
  signing out removes them from the phone, so the next person to use it
  never sees this account's list.
- The auth session is stored in the Keychain/Keystore
  (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so it is not in iCloud backups).
- Every outbound URL goes through `src/lib/links.ts` (https only).
- Support lines: a `directory` entry is never shown as a crisis line, and
  `reports_to_police` is three-state — absent renders nothing.

## Offline city packs

A pack is one city's public venues, its events for the next 180 days, and
its country's and the international crisis lines, stored in SQLite (FTS5) on
the device. A pack ages after download, so events are re-filtered on every
read: one that has ended since is not shown, even offline. Reads
are online-first: `src/features/packs/offline.ts` answers from a pack only
when the network read **fails**, never when it succeeds — a venue the
server stopped returning was closed, merged or gated and must not come
back from an old file.

- **Integrity.** `index.json` is signed with ed25519 and pins every pack's
  sha256, so one signature covers the hotline numbers too. The app refuses
  an unsigned or altered file, a pack that does not match its digest, and an
  index older than one it already accepted (rollback).
- **Safety gating.** `scripts/packs/build.mjs` reads with the publishable
  key and refuses a service-role key, so RLS keeps safety-gated venues out
  of every pack (Dubai builds with 0 venues). It also refuses to build when
  the help page has no hotlines.
- **Not offline yet:** map tiles and photos.

```sh
node scripts/packs/keygen.mjs            # once; private half -> secret store
PACK_SIGNING_KEY=… node scripts/packs/build.mjs --cities berlin,zuerich --out dist/packs
```

Upload `dist/packs/` to a static https host, then build the app with
`EXPO_PUBLIC_PACK_BASE_URL` and `EXPO_PUBLIC_PACK_PUBLIC_KEY`. Without both,
the Me tab says offline cities are not available and nothing is fetched.

## Discreet mode (Me → Discreet mode)

All on-device; no server flag records that anyone uses it. Settings live in
the keychain/keystore.

- **App lock** — Face ID / fingerprint / device passcode, with a grace period
  (immediately, 1 or 5 minutes). Turning it on or off requires authenticating
  first, so nobody locks themselves out and nobody else can quietly disable
  it. While locked, an unbranded cover sits over the app and the content is
  hidden from screen readers; the navigator stays mounted for deep links.
- **Hide in app switcher** (on by default) — iOS blur overlay; Android
  `FLAG_SECURE`, which also blocks screenshots.
- **Quick exit** — an Exit button on Explore and Help that clears every cached
  query and jumps to a blank, unbranded scratch page. Long-press the date to
  return (asks to unlock if the lock is on).
- **Alternate icons** — two neutral grid icons. On iOS only the icon changes:
  the home-screen name stays "queer.guide".

## Account (Me → Account)

Email + password sign-in and sign-up against the same Supabase project as
the web, so it is the same account. Sign-up sends only the three consent
timestamps the web sends; the database trigger mints username and avatar.

- **Cache reset on user change.** Signed-in users see safety-gated places
  that visitors do not, so every cached query is dropped on sign-out and
  when a different user signs in.
- **Sign-out is local** — it ends the session on this phone only.
- **Delete account** calls the same `delete-account` edge function as the
  web's Danger zone. The confirmation is the username when the profile has
  one, otherwise the email — what the function checks. Local saved places
  and downloaded cities are not account data and stay until removed.
- Password reset opens queer.guide (its redirect is on the web allowlist).
- If GoTrue CAPTCHA is switched on, native sign-in fails with a clear
  message until the app gets a Turnstile step. It is off on prod today.

## Notifications (plumbing only)

Me → Notifications registers this phone's native APNs/FCM token in
`user_push_tokens` (RLS: owner only). Nothing sends to it yet.

- Off by default; the OS prompt appears only from that toggle.
- Native device token, not an Expo push token: no third-party relay learns
  who is registered.
- Sign-out (and a session ending on its own) kills the token on the device
  and deletes its row while the session still exists. The device step holds
  offline too, so the next person to sign in on this phone can never get
  the previous account's notifications. Sign-out never waits on the network.
- Android needs a Firebase `google-services.json` before FCM tokens work;
  without it the toggle reports "not available on this build".

## Fonts and builds

- **Fonts:** Anton (display, headline) and Space Grotesk (everything else),
  the web's pairing, bundled as OFL ttf from `@expo-google-fonts`. Weight is
  chosen by family (`src/theme/fonts.ts`) because Android fakes bold on a
  custom family rather than picking a weight.
- **EAS profiles** (`eas.json`): `development` (dev client, internal,
  `APP_VARIANT=development` → `guide.queer.app.dev`), `simulator`, `preview`
  (internal), `production` (remote version, auto-increment). Run `eas init`
  once to attach the project; put `EXPO_PUBLIC_PACK_*` in EAS environment
  variables, never in the repo.
- `expo-system-ui` is required for `userInterfaceStyle: automatic` to follow
  dark mode on Android.

## Not done yet

Tracked in the strategy doc's work breakdown: offline map tiles (PMTiles
extracts in packs), pack hosting + a scheduled rebuild, other result
types in search (news, cities), passkey and OAuth sign-in and universal links
(queer.guide already serves AASA / assetlinks from the redirect-domain
registry, which only allows `/go/*` on the built-in host — widening that
for the first-party app is a decision, plus the Apple Team ID and Android
signing fingerprint), in-app password reset, a push sender (APNs key / FCM
project).
Store metadata is drafted in `store/` but not yet submitted.

## Device E2E (Maestro)

Flows live in `.maestro/` and run against a dev or preview build on a
simulator/emulator: `maestro test .maestro`. They select by English copy, and
CI does not run Maestro, so `src/__tests__/maestroFlows.test.ts` fails if a
flow taps or asserts a string that is no longer in `en.json`. Venue `mylord`
(Zurich) is the fixed test place; if it is ever merged or closed, change the
flow and the test's `DATA` set together.

Store listing, privacy labels, age rating and review notes: `store/`.

## Accessibility

- Errors are announced: `StateMessage` (error kind) and `Alert` call
  `AccessibilityInfo.announceForAccessibility` and carry
  `accessibilityRole="alert"` / an assertive live region, so a failed
  sign-in or download is spoken on iOS as well as Android.
- The map is a single labelled element that points to the list below it;
  the list is the accessible way to browse what the map shows.
- Hotline buttons are named after the line they call ("Call +41 …, <line>"),
  so a screen-reader user scanning by buttons hears which service each is.
- No right-to-left locale ships yet (en, de). No style is left- or
  right-specific except symmetric insets, so layouts should mirror, but RTL
  has not been tested on a device and must be before an RTL catalog ships.
