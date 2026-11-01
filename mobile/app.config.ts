import type { ExpoConfig } from 'expo/config';

/**
 * queer.guide native app.
 *
 * Privacy posture is a hard constraint (see mobile/README.md):
 *   - no analytics / attribution / crash SDKs are configured here
 *   - location is foreground-only ("when in use") and never leaves the device
 *   - every URL on queer.guide that has an in-app screen opens the app
 *     (universal links / app links); the AASA + assetlinks.json files are
 *     served by the web app and are a separate change
 */
const IS_DEV = process.env.APP_VARIANT === 'development';

const config: ExpoConfig = {
  name: IS_DEV ? 'queer.guide (dev)' : 'queer.guide',
  slug: 'queer-guide',
  scheme: 'queerguide',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  // Paper (#FAFAF5) — matches --background in src/index.css.
  backgroundColor: '#FAFAF5',
  ios: {
    bundleIdentifier: IS_DEV ? 'guide.queer.app.dev' : 'guide.queer.app',
    supportsTablet: true,
    associatedDomains: ['applinks:queer.guide', 'webcredentials:queer.guide'],
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Your location moves the map to where you are. Your coordinates stay on this device; queer.guide only receives the area of map on screen, to load places in it.',
      ITSAppUsesNonExemptEncryption: false,
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
    },
  },
  android: {
    package: IS_DEV ? 'guide.queer.app.dev' : 'guide.queer.app',
    adaptiveIcon: {
      backgroundColor: '#FAFAF5',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: true,
    // Coarse + fine "while in use" only. No background location.
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    blockedPermissions: ['ACCESS_BACKGROUND_LOCATION'],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: 'queer.guide', pathPrefix: '/venues/' },
          { scheme: 'https', host: 'queer.guide', pathPrefix: '/help' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    'expo-secure-store',
    'expo-localization',
    'expo-image',
    'expo-font',
    '@maplibre/maplibre-react-native',
    // FTS5 powers offline search over downloaded city packs.
    ['expo-sqlite', { enableFTS: true }],
    [
      'expo-local-authentication',
      { faceIDPermission: 'Face ID is used only to unlock the app on this device.' },
    ],
    // Neutral alternate icons for discreet mode. No brand mark, no rainbow.
    [
      'expo-alternate-app-icons',
      [
        {
          name: 'Atlas',
          ios: './assets/icons/atlas-ios.png',
          android: { foregroundImage: './assets/icons/atlas-android-fg.png', backgroundColor: '#FAFAF5' },
        },
        {
          name: 'Ink',
          ios: './assets/icons/ink-ios.png',
          android: { foregroundImage: './assets/icons/ink-android-fg.png', backgroundColor: '#111111' },
        },
      ],
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Your location moves the map to where you are. Your coordinates stay on this device; queer.guide only receives the area of map on screen, to load places in it.',
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
