/**
 * Classify a request as automated before its search is logged.
 *
 * `search_queries` feeds the admin search analytics. Measured on prod
 * 2026-11-27, automated traffic dominated it: the top three queries of the
 * last 30 days ("harris todd" 99, "abba" 92, "mdma" 86) were loops of fresh
 * browser contexts, and every one of the 102 "gay bars in lisbon" rows came
 * from `e2e/assistant-chat.spec.ts`.
 *
 * The page already refuses to opt in when `navigator.webdriver` is set
 * (src/lib/analyticsConsent.ts), so a plain Playwright browser is never logged.
 * This catches what opts in anyway: scripts that send X-Search-Analytics
 * themselves, and browsers an agent drives without the webdriver flag.
 *
 * The row is TAGGED, not dropped. A tagged row lets us prove a spec run left
 * no untagged rows, and an over-eager rule can be undone by clearing the tag.
 * The analytics RPCs read `search_queries_reader`, which excludes tagged rows.
 *
 * Signals, strongest first:
 *  - `X-QG-Synthetic: <label>`: an explicit marker for scripts that call the
 *    worker directly. Browsers never send it (it is not in the CORS
 *    allow-list), so only non-browser clients can use it.
 *  - `QueerGuideE2E` in the user agent: set for every Playwright project in
 *    `playwright.config.ts`. A user-agent marker instead of a header because
 *    Playwright's extraHTTPHeaders go to every origin and would break CORS
 *    preflights to Supabase and this worker.
 *  - `HeadlessChrome`: a Playwright or Puppeteer context created without the
 *    config's user agent (`browser.newContext()` does not inherit it).
 *  - Other automation clients: HTTP libraries, CLI tools, crawlers, monitors.
 */

const MARKER_HEADER = "x-qg-synthetic";
const LABEL_RE = /^[a-z0-9][a-z0-9_.-]{0,31}$/;

const AUTOMATED_UA =
	/playwright|puppeteer|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|statuscake|checkly|curl\/|wget\/|httpie|python-requests|python-urllib|aiohttp|httpx|node-fetch|undici|axios|got \(|go-http-client|okhttp|java\/|libwww|\bbot\b|bot\/|crawler|spider|slurp/i;

export function syntheticTrafficReason(request: Request): string | null {
	const marker = request.headers.get(MARKER_HEADER)?.trim().toLowerCase();
	if (marker) return LABEL_RE.test(marker) ? `marker:${marker}` : "marker";

	const ua = request.headers.get("user-agent")?.trim() ?? "";
	if (!ua) return "no_user_agent";
	if (/QueerGuideE2E/.test(ua)) return "e2e";
	if (/HeadlessChrome/.test(ua)) return "headless_browser";
	if (AUTOMATED_UA.test(ua)) return "automated_user_agent";
	return null;
}
