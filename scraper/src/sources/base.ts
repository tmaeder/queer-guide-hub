import type { EntityType, SourceRawEntity } from '../types/schemas.js';
import type { SourceConfig, SourceConnector, DiscoveredUrl } from '../types/connector.js';
import { isSourceDisabled } from '../config.js';
import { fetchWithRetry, type FetchResult } from '../utils/fetch.js';
import { childLogger } from '../utils/logger.js';

/**
 * Base connector providing common functionality for all sources.
 * Each source extends this and implements discover() and fetchDetail().
 */
export abstract class BaseConnector implements SourceConnector {
  abstract readonly config: SourceConfig;
  protected log;

  constructor(name: string) {
    this.log = childLogger(name);
  }

  isEnabled(): boolean {
    return !isSourceDisabled(this.config.name);
  }

  abstract discover(entityType: EntityType): AsyncGenerator<DiscoveredUrl[]>;
  abstract fetchDetail(url: string): Promise<SourceRawEntity[]>;

  async cleanup(): Promise<void> {
    // Override in subclasses that manage browsers
  }

  /** Convenience: fetch a URL using the source's config */
  protected fetch(url: string): Promise<FetchResult> {
    return fetchWithRetry(url, {
      userAgent: this.config.userAgent,
      baseUrl: this.config.baseUrl,
      crawlDelay: this.config.crawlDelay,
    });
  }

  /** Build a SourceRawEntity from parsed data */
  protected buildRawEntity(
    sourceId: string,
    entityType: EntityType,
    url: string,
    rawData: Record<string, unknown>,
  ): SourceRawEntity {
    return {
      source_name: this.config.name,
      source_id: sourceId,
      entity_type: entityType,
      url,
      raw_data: rawData,
      fetched_at: new Date(),
    };
  }
}
