/**
 * MisterBnB connector – PLACEHOLDER.
 *
 * https://www.misterbandb.com/ requires user authentication to view listings.
 * This connector immediately reports as "blocked by login wall" and does not
 * attempt any scraping.
 *
 * To enable:
 *   - Enter an official data-sharing partnership with MisterBnB, OR
 *   - Obtain an API key / RSS feed from them.
 *   - Replace this stub with a real implementation.
 *
 * Status: "needs manual or official partnership"
 */
import { BaseConnector } from '../base.js'
import { logger } from '../../utils/logger.js'
import type { DiscoverOptions, ConnectorResult } from '../base.js'
import type { SourceRawEntity, EntityType } from '../../normalize/schema.js'
import type { SourceName } from '../../utils/config.js'

const BLOCKED_REASON =
  'MisterBnB requires user login to access listings. ' +
  'Scraping is not possible without authentication. ' +
  'Status: needs manual or official partnership.'

export class MisterBnBConnector extends BaseConnector {
  readonly source: SourceName = 'misterbandb'
  readonly supportedTypes: EntityType[] = ['stay', 'venue', 'event']

  async *discover(_opts?: DiscoverOptions): AsyncGenerator<string> {
    // Yield nothing – site is not publicly accessible
    logger.info({ source: 'misterbandb' }, BLOCKED_REASON)
  }

  async fetchDetail(_url: string): Promise<SourceRawEntity[]> {
    return []
  }

  override async run(): Promise<ConnectorResult> {
    logger.warn({ source: 'misterbandb' }, BLOCKED_REASON)
    return {
      source: this.source,
      blocked: true,
      blockedReason: BLOCKED_REASON,
      pagesFetched: 0,
      entitiesParsed: 0,
      errors: [],
      entities: [],
    }
  }
}
