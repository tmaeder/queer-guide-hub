import { createHash } from 'node:crypto';
import { childLogger } from './logger.js';
import { isAllowedByRobots } from './robots.js';
import { config } from '../config.js';

const log = childLogger('fetch');

export interface FetchOptions {
  userAgent: string;
  baseUrl: string;
  /** Delay in seconds between requests to the same domain */
  crawlDelay: number;
  /** Maximum retries on 429/5xx */
  maxRetries?: number;
  /** Initial backoff in ms */
  initialBackoff?: number;
  /** Request timeout in ms */
  timeout?: number;
  /** Maximum response body size in bytes */
  maxBodyBytes?: number;
}

/** Track last request time per domain for rate limiting */
const lastRequestTime = new Map<string, number>();

/** Sleep for a given number of ms */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Add jitter to a delay (±25%) */
function jitter(ms: number): number {
  return ms * (0.75 + Math.random() * 0.5);
}

/** Enforce per-domain crawl delay */
async function enforceCrawlDelay(domain: string, delayMs: number): Promise<void> {
  const last = lastRequestTime.get(domain) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < delayMs) {
    const waitMs = jitter(delayMs - elapsed);
    log.debug({ domain, waitMs: Math.round(waitMs) }, 'Rate limiting');
    await sleep(waitMs);
  }
}

/**
 * Parse a Retry-After header. Returns milliseconds to wait, or null if the
 * header is absent/unparsable. Caps at 5 minutes to avoid unbounded blocks.
 */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const maxWait = 5 * 60 * 1000;
  const trimmed = header.trim();
  // Case 1: seconds
  if (/^\d+$/.test(trimmed)) {
    return Math.min(parseInt(trimmed, 10) * 1000, maxWait);
  }
  // Case 2: HTTP-date
  const ts = Date.parse(trimmed);
  if (!isNaN(ts)) {
    const diff = ts - Date.now();
    return Math.max(0, Math.min(diff, maxWait));
  }
  return null;
}

/**
 * Read a response body enforcing a size cap. Aborts if the body exceeds
 * `limit` bytes. Protects against buggy or malicious endpoints.
 */
async function readBodyWithLimit(res: Response, limit: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder('utf-8');
  let received = 0;
  let out = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      received += value.byteLength;
      if (received > limit) {
        reader.cancel().catch(() => {});
        throw new Error(`Response body exceeded ${limit} bytes`);
      }
      out += decoder.decode(value, { stream: true });
    }
  }
  out += decoder.decode();
  return out;
}

export interface FetchResult {
  url: string;
  status: number;
  body: string;
  contentType: string;
  hash: string;
  fetchedAt: Date;
  blockedByRobots: boolean;
}

/**
 * Fetch a URL with:
 * - robots.txt checking
 * - Per-domain rate limiting with jitter
 * - Retry-After honoring on 429 (capped at 5min)
 * - Exponential backoff on 5xx
 * - Configurable timeout
 * - Response body-size cap (defends against runaway downloads)
 */
export async function fetchWithRetry(
  url: string,
  opts: FetchOptions,
): Promise<FetchResult> {
  const {
    userAgent,
    baseUrl,
    crawlDelay,
    maxRetries = 3,
    initialBackoff = 2000,
    timeout = 30_000,
    maxBodyBytes = config.scraper.maxBodyBytes,
  } = opts;

  // Check robots.txt
  const allowed = await isAllowedByRobots(url, baseUrl, userAgent);
  if (!allowed) {
    log.info({ url }, 'Blocked by robots.txt');
    return {
      url,
      status: 0,
      body: '',
      contentType: '',
      hash: '',
      fetchedAt: new Date(),
      blockedByRobots: true,
    };
  }

  const domain = new URL(url).hostname;
  const delayMs = crawlDelay * 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await enforceCrawlDelay(domain, delayMs);

    try {
      lastRequestTime.set(domain, Date.now());
      const res = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        signal: AbortSignal.timeout(timeout),
        redirect: 'follow',
      });

      if (res.status === 429) {
        // Honor server's Retry-After hint when present; otherwise exponential backoff.
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
        const backoff = retryAfter ?? jitter(initialBackoff * Math.pow(2, attempt));
        log.warn(
          { url, status: res.status, attempt, backoffMs: Math.round(backoff), retryAfter },
          'Rate limited — backing off',
        );
        // Drain so the socket can be reused.
        try { await res.body?.cancel(); } catch { /* noop */ }
        await sleep(backoff);
        continue;
      }
      if (res.status >= 500) {
        const backoff = jitter(initialBackoff * Math.pow(2, attempt));
        log.warn({ url, status: res.status, attempt, backoffMs: Math.round(backoff) }, 'Server error — retrying');
        try { await res.body?.cancel(); } catch { /* noop */ }
        await sleep(backoff);
        continue;
      }

      const body = await readBodyWithLimit(res, maxBodyBytes);
      const hash = createHash('sha256').update(body).digest('hex');

      return {
        url,
        status: res.status,
        body,
        contentType: res.headers.get('content-type') || '',
        hash,
        fetchedAt: new Date(),
        blockedByRobots: false,
      };
    } catch (err) {
      if (attempt === maxRetries) {
        log.error({ url, attempt, err }, 'All retries exhausted');
        throw err;
      }
      const backoff = jitter(initialBackoff * Math.pow(2, attempt));
      log.warn({ url, attempt, backoffMs: Math.round(backoff), err }, 'Request failed, retrying');
      await sleep(backoff);
    }
  }

  // Should not reach here
  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}

/** Hash a string (for snapshot dedup) */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
