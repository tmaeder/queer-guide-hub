/**
 * Imperative escape from a sensitive page. Replaces location with a neutral
 * page (default: weather.com) and scrubs the back stack via
 * history.replaceState so the visitor can't be returned by the back button.
 *
 * Used by QuickExit component (ESC key + button) and any other crisis-UX flow.
 */
const NEUTRAL_URL = 'https://weather.com/';

export function performQuickExit(): void {
  try {
    // Push a neutral entry so the immediate back step lands on weather.com.
    window.history.replaceState(null, '', NEUTRAL_URL);
  } catch {
    // ignore
  }
  window.location.replace(NEUTRAL_URL);
}
