import robotsParser from 'robots-parser';
import { childLogger } from './logger.js';

const log = childLogger('robots');

const cache = new Map<string, { parser: ReturnType<typeof robotsParser>; fetchedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetch and parse robots.txt for a given base URL.
 * Results are cached for 1 hour.
 */
export async function getRobotsParser(
  baseUrl: string,
  userAgent: string,
): Promise<ReturnType<typeof robotsParser>> {
  const cached = cache.get(baseUrl);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.parser;
  }

  const robotsUrl = new URL('/robots.txt', baseUrl).toString();
  let robotsTxt = '';

  try {
    const res = await fetch(robotsUrl, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      robotsTxt = await res.text();
    } else {
      log.warn({ url: robotsUrl, status: res.status }, 'Failed to fetch robots.txt — assuming all paths allowed');
    }
  } catch (err) {
    log.warn({ url: robotsUrl, err }, 'Error fetching robots.txt — assuming all paths allowed');
  }

  const parser = robotsParser(robotsUrl, robotsTxt);
  cache.set(baseUrl, { parser, fetchedAt: Date.now() });
  return parser;
}

/**
 * Check if a URL is allowed by robots.txt
 */
export async function isAllowedByRobots(url: string, baseUrl: string, userAgent: string): Promise<boolean> {
  const parser = await getRobotsParser(baseUrl, userAgent);
  return parser.isAllowed(url, userAgent) ?? true;
}

/**
 * Get the crawl delay from robots.txt (returns seconds, or null if not specified)
 */
export async function getCrawlDelay(baseUrl: string, userAgent: string): Promise<number | null> {
  const parser = await getRobotsParser(baseUrl, userAgent);
  const delay = parser.getCrawlDelay(userAgent);
  return delay ?? null;
}
