/**
 * Abstract BaseConnector.
 *
 * Every source connector must:
 *  1. Implement `discover()` – async generator of detail-page URLs.
 *  2. Implement `fetchDetail(url)` – fetch + parse a single page.
 *  3. Call `this.beforeFetch(url)` before any network request;
 *     if it returns false the URL is blocked and should be skipped.
 *
 * The `run()` method orchestrates discover → fetchDetail → return results.
 */
import pino from 'pino'
import { isAllowed } from '../utils/robots.js'
import { rateLimit } from '../utils/rateLimit.js'
import { fetchWithRetry } from '../utils/fetch.js'
import { config } from '../utils/config.js'
import { createChildLogger } from '../utils/logger.js'
import type { SourceRawEntity, EntityType } from '../normalize/schema.js'
import type { SourceName } from '../utils/config.js'

export interface RunOptions {
  types?: EntityType[]
  maxPages?: number
  sinceMs?: number // only re-scrape if last run was before NOW - sinceMs
}

export interface DiscoverOptions {
  types?: EntityType[]
  maxPages?: number
}

export interface ConnectorError {
  url: string
  message: string
  status?: number
  stack?: string
}

export interface ConnectorResult {
  source: SourceName
  blocked: boolean
  blockedReason?: string
  pagesFetched: number
  entitiesParsed: number
  errors: ConnectorError[]
  entities: SourceRawEntity[]
}

export abstract class BaseConnector {
  abstract readonly source: SourceName
  abstract readonly supportedTypes: EntityType[]

  protected readonly log: pino.Logger

  constructor() {
    // logger is assigned after construction so `this.source` is available
    this.log = createChildLogger('base') // overridden below
  }

  protected get logger() {
    return createChildLogger(this.source)
  }

  /** Check kill switch + robots.txt. Returns false = skip. */
  protected async beforeFetch(url: string): Promise<boolean> {
    if (config.disableSources[this.source]) {
      this.logger.info({ url }, 'Source disabled via kill switch')
      return false
    }
    const allowed = await isAllowed(url)
    if (!allowed) {
      this.logger.warn({ url }, 'Blocked by robots.txt')
    }
    return allowed
  }

  /** Rate-limited, retrying GET. Returns null if blocked. */
  protected async politeGet(url: string): Promise<Response | null> {
    if (!(await this.beforeFetch(url))) return null
    await rateLimit(url)
    return fetchWithRetry(url, {
      headers: { 'User-Agent': config.scraperUserAgent },
    })
  }

  /** Fetch HTML text. Returns null if blocked or errored. */
  protected async fetchHtml(url: string): Promise<string | null> {
    const res = await this.politeGet(url)
    if (!res) return null
    if (!res.ok) {
      this.logger.warn({ url, status: res.status }, 'Non-OK response')
      return null
    }
    return res.text()
  }

  /** Fetch and parse JSON. Returns null if blocked/errored. */
  protected async fetchJson<T>(url: string): Promise<T | null> {
    const res = await this.politeGet(url)
    if (!res) return null
    if (!res.ok) {
      this.logger.warn({ url, status: res.status }, 'Non-OK JSON response')
      return null
    }
    try {
      return (await res.json()) as T
    } catch {
      this.logger.warn({ url }, 'Failed to parse JSON')
      return null
    }
  }

  abstract discover(opts?: DiscoverOptions): AsyncGenerator<string>
  abstract fetchDetail(url: string): Promise<SourceRawEntity[]>

  async run(opts: RunOptions = {}): Promise<ConnectorResult> {
    if (config.disableSources[this.source]) {
      return {
        source: this.source,
        blocked: true,
        blockedReason: 'kill switch',
        pagesFetched: 0,
        entitiesParsed: 0,
        errors: [],
        entities: [],
      }
    }

    const maxPages = opts.maxPages ?? 500
    const entities: SourceRawEntity[] = []
    const errors: ConnectorError[] = []
    let pagesFetched = 0

    for await (const url of this.discover({ ...(opts.types !== undefined ? { types: opts.types } : {}), maxPages })) {
      if (pagesFetched >= maxPages) break
      try {
        const items = await this.fetchDetail(url)
        entities.push(...items)
        pagesFetched++
      } catch (err) {
        const e = err as Error
        this.logger.error({ url, err }, 'fetchDetail failed')
        errors.push({
          url,
          message: e.message,
          ...(e.stack !== undefined ? { stack: e.stack } : {}),
        })
      }
    }

    return {
      source: this.source,
      blocked: false,
      pagesFetched,
      entitiesParsed: entities.length,
      errors,
      entities,
    }
  }
}

/** Shared browser concurrency semaphore (max 2 Playwright browsers). */
export class Semaphore {
  private queue: Array<() => void> = []
  private running = 0

  constructor(public readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++
      return
    }
    await new Promise<void>((resolve) => this.queue.push(resolve))
    this.running++
  }

  release(): void {
    this.running--
    this.queue.shift()?.()
  }
}

export const browserSemaphore = new Semaphore(config.maxConcurrency)
