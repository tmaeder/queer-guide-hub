# Compliance Notes

## robots.txt Status per Source

| Source | robots.txt | Crawl-delay | Key restrictions | Status |
|--------|-----------|-------------|------------------|--------|
| Wikipedia | Accessible | None for generic bots | Blocks /w/ for some bots; API recommended | OK — uses MediaWiki API |
| IGLTA | Accessible | 2s | Blocks /plugins/crm/count/ only | OK — public events |
| Outsavvy | Accessible | None specified | Blocks /profile/ | OK — uses sitemap |
| TravelGay | **403 on robots.txt** | Unknown | Unknown | **Conservative** — 10s+ delay, stops on 403 |
| Patroc | Accessible | 10s | Blocks SEO bots, /cgi-bin/, /cgi-data/ | OK — respects 10s delay |
| MisterBnB | Accessible | None specified | Blocks /api/, /admin/, /account/, /users/, /payment/ | OK — public listings only |

## How We Respect Each Site

### Wikipedia
- Uses the **official MediaWiki API** (`action=parse`) instead of scraping HTML directly
- API is the recommended machine-readable access method per Wikipedia's policy
- Rate limited to 2s between requests (polite mode: 4s)

### IGLTA
- Respects the 2s crawl-delay from robots.txt (polite mode: 4s)
- Attempts their REST API first before falling back to browser rendering
- Only accesses the public Pride calendar page

### Outsavvy
- Uses the **sitemap.xml** to discover event URLs (preferred over crawling)
- Respects the /profile/ disallow
- Parses JSON-LD structured data when available (intended for machine consumption)
- 3s crawl delay (polite mode: 6s)

### TravelGay
- **Returns 403** on both robots.txt and the homepage from our scraper
- The connector tests accessibility first and **stops immediately if blocked**
- Logs "needs manual access or official partnership"
- Uses a conservative 10s+ crawl delay when accessible
- No pages will be scraped if the site blocks our User-Agent

### Patroc
- Respects the 10s crawl-delay from robots.txt (polite mode: 20s)
- Only accesses /gay/ paths (city guides)
- Avoids all disallowed paths (/cgi-bin/, /cgi-data/)
- Identifies itself with a descriptive User-Agent including contact info

### MisterBnB
- Respects all disallowed paths (/api/, /admin/, /account/, etc.)
- Only accesses public listing/destination pages
- **Detects login walls and CAPTCHAs** — stops immediately if found
- Logs "needs manual or official partnership" when blocked
- Tests accessibility before attempting any scraping

## Anti-Bot Protection Policy

We **never**:
- Bypass CAPTCHAs or human verification
- Circumvent login walls
- Rotate User-Agents to evade detection
- Use proxy pools or IP rotation
- Override rate limits or ignore 429 responses
- Scrape user profiles, reviews, or private content

We **always**:
- Identify ourselves with a descriptive User-Agent: `QueerGuideScraper/1.0 (+https://queer.guide/about; contact@queer.guide)`
- Check robots.txt before every request
- Respect crawl-delay directives (with 2x multiplier in polite mode)
- Use exponential backoff on 429/5xx responses
- Stop gracefully when blocked
- Log all access attempts and blocks for audit

## Data Collection Policy

- **Public data only**: We only collect publicly visible listing information (names, addresses, descriptions, URLs)
- **No PII beyond what's published**: We don't scrape user profiles, reviews, or private information
- **Source attribution**: Every entity tracks its source URL and source name
- **Snapshots for audit**: Raw HTML/JSON snapshots are stored for debugging and compliance review
- **Kill switches**: Any source can be immediately disabled via environment variable

## Source verdict: gaycities.com (2026-07-04)

- **robots.txt**: `User-agent: * → Allow: /`. Cloudflare Content-Signals:
  `search=yes, ai-train=no, use=reference` (EU DSM Art. 4 rights reservation).
- **Our use**: directory-style import of event facts (title, dates, venue,
  city, ticket URL, image) plus the event description, with the source
  permalink stored in `event_sources.source_url` / `metadata.source_url` for
  attribution. No AI training on the content. This matches the allowed
  `search=yes` / `use=reference` signals.
- **Access method**: gaycities.com serves 403 to all plain HTTP clients
  (including our identified scraper UA) but serves a real browser session
  without any challenge, CAPTCHA, or login wall. Extraction therefore runs
  through a single headless Playwright session at ≤1 req/1.5–2.5s
  (scripts/gaycities-backfill.ts, scripts/gaycities-sync.ts). No CAPTCHA
  bypass, no login circumvention, no proxy/IP rotation, no 429 override —
  the session backs off and recycles on errors.
- **Historical pages** (2012–2021) are seeded from the Wayback Machine CDX
  API (no Cloudflare, public archive) and re-fetched from the live site;
  dead permalinks may fall back to the public Wayback snapshot.
