/**
 * Wikipedia connector – gay villages list.
 *
 * Static HTML page; no JS rendering required.
 * Single URL, no pagination needed.
 */
import { BaseConnector } from '../base.js'
import { parseGayVillages } from './parser.js'
import { saveSnapshot } from '../../utils/snapshot.js'
import { config } from '../../utils/config.js'
import type { DiscoverOptions, ConnectorResult } from '../base.js'
import type { SourceRawEntity, EntityType } from '../../normalize/schema.js'
import type { SourceName } from '../../utils/config.js'

const PAGE_URL = 'https://en.wikipedia.org/wiki/List_of_gay_villages'

export class WikipediaConnector extends BaseConnector {
  readonly source: SourceName = 'wikipedia'
  readonly supportedTypes: EntityType[] = ['place']

  async *discover(_opts?: DiscoverOptions): AsyncGenerator<string> {
    yield PAGE_URL
  }

  async fetchDetail(url: string): Promise<SourceRawEntity[]> {
    const html = await this.fetchHtml(url)
    if (!html) return []

    await saveSnapshot({
      url,
      source: this.source,
      content: html,
      contentType: 'html',
      httpStatus: 200,
    }).catch(() => {}) // non-fatal

    const entities = parseGayVillages(html)
    this.logger.info({ count: entities.length }, 'Parsed gay villages from Wikipedia')
    return entities
  }

  /** Wikipedia connector overrides run() for simplicity (single page). */
  override async run(): Promise<ConnectorResult> {
    if (config.disableSources.wikipedia) {
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

    const allowed = await this['beforeFetch'](PAGE_URL)
    if (!allowed) {
      return {
        source: this.source,
        blocked: true,
        blockedReason: 'blocked by robots.txt',
        pagesFetched: 0,
        entitiesParsed: 0,
        errors: [],
        entities: [],
      }
    }

    try {
      const entities = await this.fetchDetail(PAGE_URL)
      return {
        source: this.source,
        blocked: false,
        pagesFetched: 1,
        entitiesParsed: entities.length,
        errors: [],
        entities,
      }
    } catch (err) {
      const e = err as Error
      this.logger.error({ err }, 'Wikipedia run failed')
      return {
        source: this.source,
        blocked: false,
        pagesFetched: 0,
        entitiesParsed: 0,
        errors: [{ url: PAGE_URL, message: e.message, ...(e.stack !== undefined ? { stack: e.stack } : {}) }],
        entities: [],
      }
    }
  }
}
