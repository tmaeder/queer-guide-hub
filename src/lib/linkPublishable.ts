/**
 * Should a stored website URL be published to a reader as a clickable link?
 *
 * This is deliberately NOT the same question as `isDeadLink()` in
 * `supabase/functions/_shared/link-health.ts`, which answers "is this URL dead"
 * and is true for `broken` ONLY. Two statuses must not be published, for two
 * different reasons:
 *
 *   broken — an explicit 404/410. The page is gone; linking it sends a reader to
 *            a dead end. (261 approved venues.)
 *   unsafe — the SSRF guard REFUSED the URL, so it was never fetched at all: it
 *            resolves to a private/loopback/metadata target, or it is malformed.
 *            One of the two live cases is a venue whose host carries mojibake
 *            (`http://www.agentur-grenzg<mojibake>nger.de`) and can never resolve.
 *            Publishing that is worse than publishing a dead link.
 *
 * Everything else stays published on purpose, and the reasons are worth stating
 * because the tempting move is to hide anything that isn't `ok`:
 *
 *   redirect (5,410) — by far the most common status; a site that moved is fine.
 *   timeout  (2,552) — link-health calls network failure transient, NOT dead. A
 *                      slow or momentarily unreachable host is not a dead link.
 *   blocked  (265)   — the server refused OUR checker (403/405 to a bot UA). That
 *                      says nothing about a human with a browser.
 *   unknown  (297)   — not conclusively classified, including never-checked. A 5xx
 *                      lands here: today's 502 is often tomorrow's 200.
 *
 * Hiding those would delete thousands of working links to suppress a few dead
 * ones — the error is not symmetric, so only the two provable cases are gated.
 */
export type VenueUrlStatus =
  'ok' | 'redirect' | 'broken' | 'blocked' | 'timeout' | 'unknown' | 'unsafe' | null | undefined;

const NOT_PUBLISHABLE: ReadonlySet<string> = new Set(['broken', 'unsafe']);

export function isPublishableLink(urlStatus: VenueUrlStatus): boolean {
  if (!urlStatus) return true; // never checked — absence of evidence, not evidence
  return !NOT_PUBLISHABLE.has(urlStatus);
}
