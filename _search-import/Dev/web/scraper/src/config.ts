import 'dotenv/config';
import type { SourceConfig } from './types/index.js';

export const config = {
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/queer_guide_scraper',
  },
  scraper: {
    userAgent: process.env.SCRAPER_USER_AGENT || 'QueerGuideScraper/1.0 (+https://queer.guide/about; contact@queer.guide)',
    politeMode: process.env.SCRAPER_POLITE_MODE !== 'false',
    maxConcurrentBrowsers: parseInt(process.env.SCRAPER_MAX_CONCURRENT_BROWSERS || '2', 10),
    snapshotRetention: parseInt(process.env.SCRAPER_SNAPSHOT_RETENTION || '3', 10),
    /** Hard ceiling on response body size (bytes). Protects against memory blow-up. */
    maxBodyBytes: parseInt(process.env.SCRAPER_MAX_BODY_BYTES || '5242880', 10), // 5 MB
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
} as const;

/** Polite mode multiplier for crawl delays */
const POLITE_MULTIPLIER = 2;

function delay(base: number): number {
  return config.scraper.politeMode ? base * POLITE_MULTIPLIER : base;
}

export function isSourceDisabled(source: string): boolean {
  // Env kill switch (operations control).
  const key = `DISABLE_SOURCE_${source.toUpperCase()}`;
  if (process.env[key] === 'true') return true;
  // Code-level disable flag (data-quality control).
  return sourceConfigs[source]?.disabled === true;
}

/** Source-specific configs derived from robots.txt analysis */
export const sourceConfigs: Record<string, SourceConfig> = {
  wikipedia: {
    name: 'wikipedia',
    sourceType: 'api',
    baseUrl: 'https://en.wikipedia.org',
    userAgent: config.scraper.userAgent,
    // WMF allows 1 req/sec for unauthenticated bots; 2s already has headroom.
    // Skipping polite-mode doubling here — we hit article HTML, not the API.
    crawlDelay: 2,
    maxPagesPerRun: 50,
    supportedTypes: ['place'],
    allowedPaths: ['/wiki/'],
    disallowedPaths: ['/w/', '/api/', '/wiki/Special:'],
    requiresBrowser: false,
  },
  iglta: {
    name: 'iglta',
    sourceType: 'api',
    baseUrl: 'https://www.iglta.org',
    userAgent: config.scraper.userAgent,
    crawlDelay: delay(2), // robots.txt says Crawl-delay: 2
    maxPagesPerRun: 100,
    supportedTypes: ['event'],
    allowedPaths: ['/events/'],
    disallowedPaths: ['/plugins/crm/count/'],
    requiresBrowser: true, // Vue.js rendered
    sitemapUrl: 'https://www.iglta.org/sitemap.xml',
  },
  outsavvy: {
    name: 'outsavvy',
    sourceType: 'sitemap',
    baseUrl: 'https://www.outsavvy.com',
    userAgent: config.scraper.userAgent,
    crawlDelay: delay(3),
    maxPagesPerRun: 200,
    supportedTypes: ['event'],
    allowedPaths: ['/event/', '/guide', '/hashtag/'],
    disallowedPaths: ['/profile/'],
    requiresBrowser: false,
    sitemapUrl: 'https://www.outsavvy.com/sitemap.xml',
  },
  travelgay: {
    name: 'travelgay',
    sourceType: 'scrape',
    baseUrl: 'https://www.travelgay.com',
    userAgent: config.scraper.userAgent,
    crawlDelay: delay(10),
    maxPagesPerRun: 100,
    supportedTypes: ['venue', 'event'],
    allowedPaths: ['/'],
    disallowedPaths: [],
    requiresBrowser: false,
    // Returns 403 on both robots.txt and content fetches. Kept in the registry
    // for future re-activation after partnership; disabled until then so cron
    // doesn't waste runtime poking a dead endpoint.
    disabled: true,
  },
  patroc: {
    name: 'patroc',
    sourceType: 'scrape',
    baseUrl: 'https://www.patroc.com',
    userAgent: config.scraper.userAgent,
    crawlDelay: delay(10), // robots.txt says Crawl-delay: 10
    maxPagesPerRun: 100,
    supportedTypes: ['venue', 'event'],
    allowedPaths: ['/gay/'],
    disallowedPaths: ['/cgi-bin/', '/cgi-data/'],
    requiresBrowser: false,
  },
  misterbnb: {
    name: 'misterbnb',
    sourceType: 'browser',
    baseUrl: 'https://www.misterbandb.com',
    userAgent: config.scraper.userAgent,
    crawlDelay: delay(5),
    maxPagesPerRun: 100,
    supportedTypes: ['stay'],
    allowedPaths: ['/'],
    disallowedPaths: ['/api/', '/admin/', '/account/', '/users/', '/payment/'],
    requiresBrowser: true,
    sitemapUrl: 'https://www.misterbandb.com/sitemap.xml',
  },
};
