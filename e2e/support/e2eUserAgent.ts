import { devices } from '@playwright/test';

/**
 * Every Playwright user agent carries this token so the search proxy can tag
 * the searches it logs (`workers/search-proxy/src/syntheticTraffic.ts`). The
 * suite runs against production by default, and before this marker its
 * searches were counted as reader traffic in the admin search analytics:
 * `e2e/assistant-chat.spec.ts` alone accounted for every one of the 102
 * "gay bars in lisbon" rows in 90 days. Today the page itself refuses to opt
 * in under `navigator.webdriver`, so this marker is the second layer: it tags
 * anything from the suite that opts in anyway (a direct `request` call, a
 * context with the webdriver flag removed).
 *
 * A user-agent token, not an extra header: Playwright's `extraHTTPHeaders`
 * are sent to every origin, and a custom header would fail the CORS preflight
 * to Supabase and the search worker. The token must not contain "bot",
 * "crawler" or "spider", or the edge middleware would serve crawler HTML
 * (`functions/_lib/botUa.ts`).
 */
export const E2E_UA_MARKER = 'QueerGuideE2E/1';

type DeviceName = keyof typeof devices;

/** A device descriptor with the marker appended to its user agent. */
export function markedDevice(name: DeviceName) {
  const device = devices[name];
  return { ...device, userAgent: `${device.userAgent} ${E2E_UA_MARKER}` };
}

/**
 * The user agent for contexts that have no device descriptor: the `setup`
 * project and any `request` fixture. Desktop Chrome's agent, so pages render
 * as they do for readers.
 */
export const MARKED_DEFAULT_UA = markedDevice('Desktop Chrome').userAgent;
