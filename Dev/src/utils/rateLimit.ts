/**
 * Per-domain rate limiter.
 *
 * Respects robots.txt crawl-delay when present.
 * In polite mode uses a longer base delay with ±30 % jitter.
 */
import { getCrawlDelay } from './robots.js'
import { sleep } from './fetch.js'
import { config } from './config.js'

const lastRequestAt = new Map<string, number>()

function domainOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export async function rateLimit(url: string): Promise<void> {
  const domain = domainOf(url)
  const now = Date.now()
  const last = lastRequestAt.get(domain) ?? 0

  // Determine base delay
  const crawlDelaySec = await getCrawlDelay(url)
  const baseMs = crawlDelaySec
    ? crawlDelaySec * 1_000
    : config.politeMode
      ? config.delays.politeModeMinMs
      : config.delays.minMs

  // Add ±30 % jitter to avoid thundering-herd
  const jitter = baseMs * 0.3 * (Math.random() * 2 - 1)
  const required = Math.min(baseMs + jitter, config.delays.maxMs)
  const elapsed = now - last
  const waitMs = Math.max(0, required - elapsed)

  if (waitMs > 0) {
    await sleep(waitMs)
  }

  lastRequestAt.set(domain, Date.now())
}

/** Reset the tracker (useful in tests). */
export function resetRateLimiter(): void {
  lastRequestAt.clear()
}
