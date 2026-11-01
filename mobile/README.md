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
- Saved places live only on the device (AsyncStorage). Sync is a future,
  opt-in change.
- The auth session is stored in the Keychain/Keystore
  (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so it is not in iCloud backups).
- Every outbound URL goes through `src/lib/links.ts` (https only).
- Support lines: a `directory` entry is never shown as a crisis line, and
  `reports_to_police` is three-state — absent renders nothing.

## Offline city packs

A pack is one city's public venues plus its country's and the
international crisis lines, stored in SQLite (FTS5) on the device. Reads
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

## Not done yet

Tracked in the strategy doc's work breakdown: offline map tiles (PMTiles
extracts in packs), pack hosting + a scheduled rebuild, offline search UI,
sign-in, push, brand fonts
(the web ships woff2 only; native needs ttf/otf), EAS build profiles and
store metadata, and serving the AASA / assetlinks.json files for the
universal links declared in `app.config.ts`.
