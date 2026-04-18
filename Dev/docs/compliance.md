# Compliance Notes

This document describes how the scraping pipeline respects legal and ethical constraints.

---

## robots.txt

Every fetch is preceded by a `robots.txt` check (`src/utils/robots.ts`).

- Robots rules are fetched once per domain per hour and cached in memory.
- If a URL is disallowed for our user-agent, it is skipped and the block is logged.
- If `robots.txt` cannot be fetched (network error, 404), we treat the site as permissive (standard practice).
- Our user-agent is configured via `SCRAPER_USER_AGENT`. Set this to something identifiable with a contact address.

---

## Per-source status

| Source | robots.txt | Login required | API available | Status |
|--------|-----------|---------------|---------------|--------|
| Wikipedia | Allows bots | No | Yes (REST + Special:Export) | Operational |
| IGLTA | Checked at runtime | No | No public API found | Operational |
| Outsavvy | Checked at runtime | No | No public API found | Operational (Playwright) |
| TravelGay | Checked at runtime | No | No public API found | Operational (Playwright, anti-bot possible) |
| Patroc | Checked at runtime | No | No public API found | Operational (Playwright, check robots) |
| MisterBnB | N/A | **Yes** | No public API | **Blocked** – needs official partnership |

---

## Rate limiting

- Polite mode (default): minimum 3 seconds between requests to the same domain, ±30% jitter.
- `robots.txt` `Crawl-delay` is respected when present.
- Exponential back-off on 429 and 5xx responses (up to 30 seconds).
- Maximum 2 Playwright browser instances run concurrently.

---

## Data collected

Only publicly visible data is collected:

- Venue name, description, address, city, country, geo coordinates
- Website URL, phone number
- Opening hours, price range
- Event dates, ticket URL
- Images (URLs only, not downloaded)
- Wikipedia links

**Not collected:**
- User profiles, reviews, or ratings from user accounts
- Private messages or user-generated private content
- Payment information
- Data behind login walls

---

## PII policy

The pipeline does not collect personal information beyond what venues/events publicly display (e.g., a venue's phone number). No user profiles are scraped.

---

## Terms of Service

Connectors target publicly accessible, non-paywalled pages only.

- Wikipedia: Licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- Other sources: Terms reviewed manually. If a source updates its ToS to prohibit bots, set the kill switch (`DISABLE_SOURCE_<NAME>=true`) immediately.

---

## Kill switches

Every source can be disabled instantly without a code deployment:

```bash
DISABLE_SOURCE_PATROC=true
DISABLE_SOURCE_TRAVELGAY=true
```

In GitHub Actions, set these as **Variables** (not secrets) in repository settings.

---

## Handling anti-bot protections

The pipeline **does not** attempt to bypass:
- CAPTCHAs
- Cloudflare bot challenges
- Login walls
- IP-based rate limiting beyond polite retries

If a site deploys such measures, the connector logs `"needs manual or official partnership"` and returns zero entities. This is tracked in the `IngestRun.blocked` / `IngestRun.errors` fields.

---

## Snapshot storage

Raw HTML snapshots are stored in the `source_snapshots` table for debugging.

- Only the last `SNAPSHOT_RETENTION` (default: 3) snapshots per URL are kept.
- Snapshots are stored in the database, not on the filesystem.
- They contain only the page HTML, not derived PII.

---

## Attribution

When displaying data derived from Wikipedia, respect the [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) licence by attributing Wikipedia and linking to the original article.
