import { logger } from './logger.js'

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    message?: string
  ) {
    super(message ?? `HTTP ${status} from ${url}`)
    this.name = 'HttpError'
  }
}

export interface RetryOptions {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

/** Exponential backoff with jitter. Retries on 429 and 5xx. */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {}
): Promise<Response> {
  const { maxAttempts = 3, baseDelayMs = 2_000, maxDelayMs = 30_000 } = opts

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response | undefined
    try {
      response = await fetch(url, init)
    } catch (err) {
      if (attempt === maxAttempts) throw err
      const delay = jitterDelay(baseDelayMs, attempt, maxDelayMs)
      logger.warn({ url, attempt, err }, `Network error, retrying in ${delay}ms`)
      await sleep(delay)
      continue
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxAttempts) throw new HttpError(response.status, url)

      const retryAfterHeader = response.headers.get('retry-after')
      const delay = retryAfterHeader
        ? parseInt(retryAfterHeader, 10) * 1_000
        : jitterDelay(baseDelayMs, attempt, maxDelayMs)

      logger.warn(
        { url, status: response.status, attempt, delay },
        'Retriable error, backing off'
      )
      await sleep(delay)
      continue
    }

    return response
  }

  // Unreachable, but satisfies TypeScript
  throw new HttpError(0, url, 'Exhausted retries')
}

function jitterDelay(base: number, attempt: number, max: number): number {
  const exponential = base * Math.pow(2, attempt - 1)
  const jitter = Math.random() * 1_000
  return Math.min(exponential + jitter, max)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
