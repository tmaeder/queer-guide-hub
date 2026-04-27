import type { EntityType, SourceName, SourceRawEntity } from './schemas.js';

/** Taxonomy describing HOW a source is accessed, independent of its slug. */
export type SourceType = 'scrape' | 'api' | 'rss' | 'sitemap' | 'feed' | 'browser';

/** Per-source configuration derived from robots.txt + our policies */
export interface SourceConfig {
  name: SourceName;
  /** Classification of access method. Distinct from `name` (the slug). */
  sourceType: SourceType;
  baseUrl: string;
  userAgent: string;
  crawlDelay: number; // seconds between requests
  maxPagesPerRun: number;
  supportedTypes: EntityType[];
  allowedPaths: string[];
  disallowedPaths: string[];
  requiresBrowser: boolean;
  sitemapUrl?: string;
  /** Mark a source as disabled in code (different from env kill switch). */
  disabled?: boolean;
}

/** Discovery result: a URL to scrape with metadata */
export interface DiscoveredUrl {
  url: string;
  entityType: EntityType;
  priority?: number;
  metadata?: Record<string, unknown>;
}

/** Connector interface every source must implement */
export interface SourceConnector {
  readonly config: SourceConfig;

  /** Check if this source is enabled and allowed */
  isEnabled(): boolean;

  /** Discover list/detail URLs (pagination-aware). Yields batches. */
  discover(entityType: EntityType): AsyncGenerator<DiscoveredUrl[]>;

  /** Fetch and parse a single detail page into raw entities */
  fetchDetail(url: string): Promise<SourceRawEntity[]>;

  /** Optional: parse a list page for inline entities (some sites embed data in lists) */
  parseList?(html: string, url: string): SourceRawEntity[];

  /** Cleanup (close browsers, etc.) */
  cleanup(): Promise<void>;
}

/** Result of a connector run */
export interface ConnectorRunResult {
  source: SourceName;
  entityType: EntityType | null;
  discovered: number;
  fetched: number;
  parsed: number;
  errors: Array<{ url: string; message: string; statusCode?: number }>;
  blockedByRobots: number;
  duration: number;
}
