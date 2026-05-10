# How to Add a New Source

This guide walks through the steps to add a new LGBTQ+ data source to the pipeline.

---

## Checklist before you start

- [ ] Check `robots.txt` at `https://example.com/robots.txt`
- [ ] Review the site's Terms of Service for scraping/crawling clauses
- [ ] Check if there's an official API or RSS feed (use that instead of scraping)
- [ ] Determine if the site requires login/payment (if so, implement a placeholder)
- [ ] Identify the entity types the source provides (venue / event / stay / place)

---

## Step 1: Create the connector directory

```
src/sources/<source-name>/
  index.ts     # connector class
  parser.ts    # HTML/JSON parsing functions
```

---

## Step 2: Add the source name to config

In `src/utils/config.ts`, add your source to `disableSources`:

```ts
disableSources: {
  // existing…
  mysource: boolEnv('DISABLE_SOURCE_MYSOURCE', false),
},
```

And add it to `ALL_SOURCES`:

```ts
export const ALL_SOURCES: SourceName[] = [
  // existing…
  'mysource',
]
```

---

## Step 3: Write the parser

Create `src/sources/mysource/parser.ts`.

**Pure functions only** – no network calls, no side effects. Input: HTML string. Output: `SourceRawEntity[]`.

```ts
import { load } from 'cheerio'
import type { SourceRawEntity } from '../../normalize/schema.js'

export function parseMySourcePage(html: string, pageUrl: string): SourceRawEntity[] {
  const $ = load(html)
  const results: SourceRawEntity[] = []
  const fetchedAt = new Date().toISOString()

  // Try JSON-LD first:
  $('script[type="application/ld+json"]').each((_i, el) => {
    // ...
  })

  // HTML fallback:
  $('[class*="venue-card"]').each((_i, el) => {
    const name = $(el).find('h2').text().trim()
    if (!name) return

    results.push({
      source: 'mysource',
      sourceId: `mysource-venue-${name.toLowerCase().replace(/\s+/g, '-')}`,
      entityType: 'venue',
      url: pageUrl,
      name,
      tags: ['lgbtq+'],
      images: [],
      amenities: [],
      fetchedAt,
    })
  })

  return results
}
```

**Tips:**
- Always try JSON-LD structured data first (`script[type="application/ld+json"]`)
- For static HTML: use Cheerio (`import { load } from 'cheerio'`)
- For JS-rendered pages: use Playwright (see `outsavvy/index.ts` for a template)
- Use `require('cheerio')` inside parser functions if the connector uses Playwright (dynamic import avoids circular dependency)

---

## Step 4: Write the connector

Create `src/sources/mysource/index.ts`.

```ts
import { BaseConnector } from '../base.js'
import { parseMySourcePage } from './parser.js'
import { saveSnapshot } from '../../utils/snapshot.js'
import type { DiscoverOptions } from '../base.js'
import type { SourceRawEntity, EntityType } from '../../normalize/schema.js'
import type { SourceName } from '../../utils/config.js'

export class MySourceConnector extends BaseConnector {
  readonly source: SourceName = 'mysource'
  readonly supportedTypes: EntityType[] = ['venue'] // what this source provides

  async *discover(opts?: DiscoverOptions): AsyncGenerator<string> {
    // Yield listing page URLs (handle pagination here)
    yield 'https://www.mysource.com/venues'
  }

  async fetchDetail(url: string): Promise<SourceRawEntity[]> {
    const html = await this.fetchHtml(url)
    if (!html) return []

    await saveSnapshot({
      url, source: this.source, content: html,
      contentType: 'html', httpStatus: 200,
    }).catch(() => {})

    return parseMySourcePage(html, url)
  }
}
```

If the site is JS-heavy, extend with Playwright (see `outsavvy/index.ts`).

---

## Step 5: Register the connector

In `src/sources/registry.ts`:

```ts
import { MySourceConnector } from './mysource/index.js'

export function getRegistry() {
  return {
    // existing…
    mysource: new MySourceConnector(),
  }
}
```

---

## Step 6: Update .env.example

```env
DISABLE_SOURCE_MYSOURCE=false
```

---

## Step 7: Write tests

Create `tests/sources/mysource.test.ts` with mock HTML fixtures.
Run:

```bash
npm test
```

---

## Per-source configuration reference

| Config concept | Where configured |
|---------------|-----------------|
| Kill switch | `DISABLE_SOURCE_<NAME>=true` in `.env` |
| User-agent | Global `SCRAPER_USER_AGENT` |
| Crawl delay | Respected from `robots.txt` automatically |
| Max pages | `--max-pages=N` CLI flag |
| Supported entity types | `supportedTypes` property on the connector class |

---

## Handling blocked/restricted sources

If robots.txt disallows your bot, `this.fetchHtml()` will return `null` and the connector will yield no entities. The `IngestRun` record will record `blocked: true`.

If the site requires login, implement as a placeholder (see `misterbandb/index.ts`):

```ts
override async run(): Promise<ConnectorResult> {
  logger.warn('MySite requires login – blocked')
  return { source: this.source, blocked: true, blockedReason: 'login required', ... }
}
```
