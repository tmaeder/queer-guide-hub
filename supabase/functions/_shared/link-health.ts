// Shared link-health probing for venue-url-checker + marketplace-link-checker.
//
// Conservative by design: a link is only "dead" on an explicit 404/410. Bot
// protection, rate limiting and HEAD-unsupported servers (401/403/405/429) mean
// the site is ALIVE — classifying those as broken caused false venue demotions
// and false marketplace deactivations (the reason cron 198 was paused). Network
// errors are treated as transient ('timeout'), never as dead.
//
// SSRF: URLs come from the database (venue websites, listing URLs, article
// URLs), so probeLink refuses private/loopback/metadata targets up front and
// returns 'unsafe' — never fetched, never classified as dead.

import { assertPublicHttpUrl } from './ssrf-guard.ts'

export type LinkStatus = 'ok' | 'redirect' | 'broken' | 'blocked' | 'timeout' | 'unknown' | 'unsafe'

/** Classify a single HTTP status code. Only 404/410 are confirmed-dead. */
export function classifyHttpStatus(code: number): LinkStatus {
  if (code >= 200 && code < 300) return 'ok'
  if (code >= 300 && code < 400) return 'redirect'
  if (code === 404 || code === 410) return 'broken'
  // Alive, just blocking us: bot wall / auth / rate limit / HEAD unsupported.
  if (code === 401 || code === 403 || code === 405 || code === 429) return 'blocked'
  // Other 4xx and all 5xx are ambiguous/transient — never auto-dead.
  return 'unknown'
}

/** True ONLY for a confirmed-dead link — the only case safe to demote/deactivate on. */
export function isDeadLink(status: LinkStatus): boolean {
  return status === 'broken'
}

const DEFAULT_UA = 'QueerGuide-LinkChecker/1.0 (+https://queer.guide/about)'

/**
 * Probe a URL. HEAD first; when HEAD is blocked/ambiguous (many servers reject
 * HEAD with 403/405), fall back to GET to confirm aliveness. Network failures
 * are 'timeout' (transient), not dead. Only an explicit 404/410 yields 'broken'.
 */
export async function probeLink(
  url: string,
  opts: { timeoutMs?: number; ua?: string; fetchImpl?: typeof fetch } = {},
): Promise<LinkStatus> {
  const timeoutMs = opts.timeoutMs ?? 8_000
  const ua = opts.ua ?? DEFAULT_UA
  const doFetch = opts.fetchImpl ?? fetch

  try {
    assertPublicHttpUrl(url)
  } catch {
    return 'unsafe'
  }

  const attempt = async (method: 'HEAD' | 'GET'): Promise<LinkStatus> => {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const resp = await doFetch(url, {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': ua },
      })
      return classifyHttpStatus(resp.status)
    } finally {
      clearTimeout(tid)
    }
  }

  try {
    const head = await attempt('HEAD')
    if (head === 'blocked' || head === 'unknown') {
      // HEAD was rejected/ambiguous — confirm with a real GET.
      try {
        return await attempt('GET')
      } catch {
        return head // GET threw → keep HEAD's (non-dead) classification
      }
    }
    return head
  } catch (e) {
    const msg = (e as Error).message || ''
    if (msg.includes('abort') || msg.includes('signal')) return 'timeout'
    // Connection error on HEAD — could be HEAD-hostile or transient. Try GET once.
    try {
      return await attempt('GET')
    } catch (e2) {
      const m2 = (e2 as Error).message || ''
      if (m2.includes('abort') || m2.includes('signal')) return 'timeout'
      return 'timeout' // transient network failure — never auto-dead
    }
  }
}
