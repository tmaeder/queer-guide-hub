/**
 * robots.txt compliance helper.
 *
 * Fetches and caches the robots.txt for each domain, then exposes
 * isAllowed() and getCrawlDelay() for use before any scrape request.
 */
import { config } from './config.js'
import { logger } from './logger.js'

// robots-parser is a CommonJS module; require is more reliable for its type
// eslint-disable-next-line @typescript-eslint/no-require-imports
const robotsParser = require('robots-parser') as (
  url: string,
  content: string
) => RobotsInstance

interface RobotsInstance {
  isAllowed(url: string, ua?: string): boolean | undefined
  getCrawlDelay(ua?: string): number | undefined
}

const cache = new Map<string, { rules: RobotsInstance; fetchedAt: number }>()
const CACHE_TTL_MS = 60 * 60 * 1_000 // 1 hour

async function fetchRobots(origin: string): Promise<RobotsInstance> {
  const cached = cache.get(origin)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rules
  }

  const robotsUrl = `${origin}/robots.txt`
  let content = ''

  try {
    const res = await fetch(robotsUrl, {
      headers: { 'User-Agent': config.scraperUserAgent },
      signal: AbortSignal.timeout(10_000),
    })

    if (res.ok) {
      content = await res.text()
    } else {
      logger.debug(
        { robotsUrl, status: res.status },
        'robots.txt returned non-200; treating as permissive'
      )
    }
  } catch (err) {
    logger.warn(
      { robotsUrl, err },
      'Failed to fetch robots.txt; treating as permissive'
    )
  }

  const rules = robotsParser(robotsUrl, content)
  cache.set(origin, { rules, fetchedAt: Date.now() })
  return rules
}

/** Check whether our bot is allowed to fetch `url`. */
export async function isAllowed(url: string): Promise<boolean> {
  let origin: string
  try {
    origin = new URL(url).origin
  } catch {
    return false
  }

  const rules = await fetchRobots(origin)
  const allowed = rules.isAllowed(url, config.scraperUserAgent)
  if (allowed === false) {
    logger.warn({ url }, 'Blocked by robots.txt')
  }
  return allowed ?? true // undefined = no explicit rule → allow
}

/** Get crawl-delay in seconds from robots.txt (null if not specified). */
export async function getCrawlDelay(url: string): Promise<number | null> {
  let origin: string
  try {
    origin = new URL(url).origin
  } catch {
    return null
  }
  const rules = await fetchRobots(origin)
  return rules.getCrawlDelay(config.scraperUserAgent) ?? null
}

/** Clear the cache (useful in tests). */
export function clearRobotsCache(): void {
  cache.clear()
}
