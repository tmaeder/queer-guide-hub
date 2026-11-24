/** Shared copy for go-live failures (Nearby page, Hub switch, account menu). */
export const GO_LIVE_ERRORS: Record<string, [string, string]> = {
  // A browser refuses without prompting when the site or the OS blocks
  // location, so say where to look rather than just "denied".
  denied: [
    'people.nearby.deniedHelp',
    'Location is blocked for queer.guide. Allow it in your browser’s site settings and in your device’s location settings, then try again.',
  ],
  unavailable: [
    'people.nearby.unavailable',
    'Could not get your location. Check that location services are on for this browser, then try again.',
  ],
  presence_failed: ['people.nearby.failed', 'Could not go live. Try again.'],
};
