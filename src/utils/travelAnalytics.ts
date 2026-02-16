/**
 * Lightweight travel analytics / observability hooks.
 *
 * Tracks key events in the flight booking funnel:
 *   - search_submitted: user clicked "Search" on the flight form
 *   - results_loaded: deals returned from API (or empty)
 *   - booking_click: user clicked "Book Flight" on a deal card
 *   - url_generation_failure: affiliate URL could not be built
 *   - origin_detected: visitor origin airport resolved
 *   - origin_failed: visitor origin could not be resolved
 *
 * Events are:
 *   1. Logged to console in dev mode
 *   2. Sent to Umami analytics (if available)
 *   3. Available for future extension (e.g., Supabase event table)
 */

type TravelEventName =
  | 'search_submitted'
  | 'results_loaded'
  | 'booking_click'
  | 'url_generation_failure'
  | 'origin_detected'
  | 'origin_failed';

interface EventData {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Track a travel funnel event.
 * Safe to call anywhere — never throws.
 */
export function trackTravelEvent(event: TravelEventName, data?: EventData): void {
  try {
    // Console logging (always, for debugging)
    if (import.meta.env.DEV) {
      console.log(`[travel:${event}]`, data || '');
    }

    // Umami analytics (if loaded)
    const umami = (window as any).umami;
    if (umami?.track) {
      // Flatten data for Umami (string values only, no PII)
      const safeData: Record<string, string> = {};
      if (data) {
        for (const [k, v] of Object.entries(data)) {
          if (v !== undefined && v !== null) {
            safeData[k] = String(v);
          }
        }
      }
      umami.track(`travel_${event}`, safeData);
    }
  } catch {
    // Never throw from analytics
  }
}
