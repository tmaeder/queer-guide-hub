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

## Not done yet

Tracked in the strategy doc's work breakdown: offline city packs, discreet
mode (alternate icon, app lock, quick exit), sign-in, push, brand fonts
(the web ships woff2 only; native needs ttf/otf), EAS build profiles and
store metadata, and serving the AASA / assetlinks.json files for the
universal links declared in `app.config.ts`.
