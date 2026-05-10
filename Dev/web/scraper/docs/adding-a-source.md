# Adding a New Source

## 1. Create the connector file

Create `src/sources/mysite.ts`:

```typescript
import { BaseConnector } from './base.js';
import { sourceConfigs } from '../config.js';
import type { EntityType, SourceRawEntity } from '../types/schemas.js';
import type { SourceConfig, DiscoveredUrl } from '../types/connector.js';

export class MySiteConnector extends BaseConnector {
  readonly config: SourceConfig = sourceConfigs.mysite;

  constructor() {
    super('mysite');
  }

  async *discover(entityType: EntityType): AsyncGenerator<DiscoveredUrl[]> {
    // Yield batches of URLs to scrape
    yield [{ url: 'https://mysite.com/listings', entityType }];
  }

  async fetchDetail(url: string): Promise<SourceRawEntity[]> {
    const result = await this.fetch(url); // Uses built-in retry + robots check
    if (result.blockedByRobots || result.status !== 200) return [];

    // Parse HTML and return raw entities
    return [
      this.buildRawEntity('unique-id', 'venue', url, {
        name: 'Venue Name',
        city: 'London',
        country: 'UK',
        source_url: url,
      }),
    ];
  }
}
```

## 2. Add config

In `src/config.ts`, add to `sourceConfigs`:

```typescript
mysite: {
  name: 'mysite',
  baseUrl: 'https://mysite.com',
  userAgent: config.scraper.userAgent,
  crawlDelay: delay(5),
  maxPagesPerRun: 100,
  supportedTypes: ['venue', 'event'],
  allowedPaths: ['/'],
  disallowedPaths: ['/admin/'],
  requiresBrowser: false,
},
```

## 3. Add to SourceName enum

In `src/types/schemas.ts`:

```typescript
export const SourceName = z.enum([
  // ... existing sources ...
  'mysite',
]);
```

## 4. Register the connector

In `src/sources/index.ts`:

```typescript
import { MySiteConnector } from './mysite.js';

const connectorRegistry: Record<SourceName, () => SourceConnector> = {
  // ... existing entries ...
  mysite: () => new MySiteConnector(),
};
```

## 5. Write tests

Create `tests/unit/mysite-parser.test.ts` with fixture HTML and parser tests.

## Key principles

- **Always check robots.txt**: The `this.fetch()` method does this automatically.
- **Rate limit**: `crawlDelay` is enforced per-domain with jitter.
- **Handle blocks gracefully**: If a site returns 403 or has CAPTCHA, log it and return `[]`.
- **Prefer APIs/sitemaps**: If the site has a sitemap.xml or API, use those first.
- **Use Playwright only when needed**: For JS-heavy sites. Set `requiresBrowser: true` in config.
- **Normalize data**: Your `raw_data` object should match the field names expected by `normalizeEntity()`.
